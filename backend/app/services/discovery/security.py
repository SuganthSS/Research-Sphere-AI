"""SSRF Protection and Secure PDF Downloader for external scholarly document import."""
import ipaddress
import logging
import socket
import urllib.parse
from typing import Set
import httpx
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

# Constants
MAX_DOWNLOAD_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
MAX_REDIRECTS = 5
DOWNLOAD_TIMEOUT_SECONDS = 30.0

DISALLOWED_HOSTNAMES: Set[str] = {
    "localhost",
    "127.0.0.1",
    "::1",
    "0.0.0.0",
}


class SSRFSecurityError(Exception):
    """Raised when an external URL targets a private or forbidden network location."""
    pass


def validate_safe_url(url: str) -> str:
    """Validates that a URL is HTTPS and resolves strictly to public, non-private IP addresses."""
    parsed = urllib.parse.urlparse(url)

    # 1. Enforce HTTPS only
    if parsed.scheme.lower() != "https":
        raise SSRFSecurityError("Only secure HTTPS URLs are permitted for PDF download.")

    hostname = parsed.hostname
    if not hostname:
        raise SSRFSecurityError("Invalid URL: missing target hostname.")

    hostname_clean = hostname.strip().lower()

    # 2. Block explicitly forbidden names & internal suffixes
    if hostname_clean in DISALLOWED_HOSTNAMES:
        raise SSRFSecurityError(f"Access to '{hostname_clean}' is strictly forbidden.")

    if hostname_clean.endswith((".local", ".internal", ".lan", ".home", ".corp")):
        raise SSRFSecurityError(f"Access to internal domain '{hostname_clean}' is forbidden.")

    # 3. Resolve DNS and inspect all target IP addresses
    port = parsed.port or 443
    try:
        addr_info = socket.getaddrinfo(hostname_clean, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise SSRFSecurityError(f"DNS resolution failed for hostname '{hostname_clean}': {exc}")

    if not addr_info:
        raise SSRFSecurityError(f"No IP addresses resolved for hostname '{hostname_clean}'.")

    for item in addr_info:
        sockaddr = item[4]
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            raise SSRFSecurityError(f"Invalid resolved IP address: '{ip_str}'")

        # Block loopback, private, link-local, multicast, reserved, and unspecified
        if (
            ip.is_loopback
            or ip.is_private
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise SSRFSecurityError(
                f"Target IP address '{ip_str}' belongs to a private/local/reserved range and is forbidden."
            )

    return url


def safe_download_pdf(
    url: str,
    max_size_bytes: int = MAX_DOWNLOAD_SIZE_BYTES,
    max_redirects: int = MAX_REDIRECTS,
    timeout_seconds: float = DOWNLOAD_TIMEOUT_SECONDS,
) -> bytes:
    """Downloads an external open-access PDF with strict SSRF validation and redirect verification."""
    current_url = url
    redirects_followed = 0

    # Clean headers without internal application credentials
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ResearchSphere-AI/1.0",
        "Accept": "application/pdf,application/octet-stream,*/*",
    }

    with httpx.Client(follow_redirects=False, timeout=timeout_seconds) as client:
        while True:
            # Revalidate safe URL at every hop
            try:
                validate_safe_url(current_url)
            except SSRFSecurityError as sec_err:
                logger.warning("SSRF check rejected URL '%s': %s", current_url, sec_err)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Security rejection: {str(sec_err)}",
                )

            try:
                response = client.get(current_url, headers=headers)
            except httpx.TimeoutException:
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail="Download timed out while retrieving PDF from source.",
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Failed to connect to external PDF source: {str(exc)}",
                )

            # Handle redirects securely
            if response.status_code in (301, 302, 303, 307, 308):
                location = response.headers.get("Location")
                if not location:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="Redirect missing 'Location' header.",
                    )
                redirects_followed += 1
                if redirects_followed > max_redirects:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Exceeded maximum allowed redirect count ({max_redirects}).",
                    )
                current_url = urllib.parse.urljoin(current_url, location)
                continue

            # Validate HTTP status
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"External host returned HTTP {response.status_code} when downloading PDF.",
                )

            # Validate Content-Length header if present
            content_length_hdr = response.headers.get("Content-Length")
            if content_length_hdr:
                try:
                    declared_len = int(content_length_hdr)
                    if declared_len > max_size_bytes:
                        max_mb = max_size_bytes // (1024 * 1024)
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"PDF document exceeds maximum allowed size of {max_mb} MB.",
                        )
                except ValueError:
                    pass

            # Read content bytes
            content = response.content
            if len(content) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Downloaded document is empty (0 bytes).",
                )

            if len(content) > max_size_bytes:
                max_mb = max_size_bytes // (1024 * 1024)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"PDF document exceeds maximum allowed size of {max_mb} MB.",
                )

            # Validate PDF signature magic bytes
            if not content.startswith(b"%PDF-"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Downloaded content is not a valid PDF document (missing '%PDF-' header signature).",
                )

            return content
