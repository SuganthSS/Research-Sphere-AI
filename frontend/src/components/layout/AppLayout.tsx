import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useHealthCheck } from '../../hooks/useHealthCheck'

export const AppLayout: React.FC = () => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const { backendStatus, backendData, backendError, dbStatus, dbData, dbError, lastChecked, retry } =
    useHealthCheck()

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col font-sans antialiased selection:bg-[#2563EB] selection:text-white">
      {/* Sidebar (248px desktop width, mobile slide-over) */}
      <Sidebar
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main Layout Container with 248px left desktop margin */}
      <div className="lg:pl-[248px] flex flex-col flex-1 min-w-0">
        <Header
          onToggleMobileSidebar={() => setMobileSidebarOpen((prev) => !prev)}
          backendStatus={backendStatus}
          dbStatus={dbStatus}
          lastChecked={lastChecked}
          onRetry={retry}
        />

        {/* Main Content Area */}
        <main className="flex-1 w-full bg-[#F8FAFC]">
          <Outlet
            context={{
              backendStatus,
              backendData,
              backendError,
              dbStatus,
              dbData,
              dbError,
              lastChecked,
              retry,
            }}
          />
        </main>
      </div>
    </div>
  )
}
