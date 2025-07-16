'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'

function Page() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to /perpetuals immediately when component mounts
    router.push('/perpetuals')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0d0c0e]">
      <div className="text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-sm text-[#919093]">Redirecting...</p>
      </div>
    </div>
  )
}

export default Page