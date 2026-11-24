"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { KeyRound, Zap } from "lucide-react"
import Link from "next/link"
import { UploadSphere } from "@/components/three/upload-sphere"
import { FileUpload } from "@/components/exam/file-upload"
import { ExaminationInterface } from "@/components/exam/examination-interface"
import { ApiKeysPanel } from "@/components/exam/api-keys"
import { processPdf, resetSession } from "@/lib/engine"
import { loadKeys } from "@/lib/keys"

export default function ExamPage() {
  const [isUploading, setIsUploading] = useState(false)
  const [isExamStarted, setIsExamStarted] = useState(false)
  const [documentName, setDocumentName] = useState("")
  const [processingStatus, setProcessingStatus] = useState("")
  const [initialExamData, setInitialExamData] = useState<any>(null)
  const [showKeys, setShowKeys] = useState(false)
  const [uploadError, setUploadError] = useState("")

  useEffect(() => {
    if (!loadKeys().openrouter) setShowKeys(true)
  }, [])

  const handleFileUpload = async (file: File, enableVision: boolean) => {
    if (!loadKeys().openrouter) {
      setShowKeys(true)
      setUploadError("Add your OpenRouter API key to start the examination.")
      return
    }
    setUploadError("")
    setIsUploading(true)
    setDocumentName(file.name)
    setProcessingStatus("reading")
    try {
      const data = await processPdf(file, enableVision, setProcessingStatus)
      setProcessingStatus("")
      setInitialExamData(data)
      setIsExamStarted(true)
    } catch (error) {
      setProcessingStatus("")
      setUploadError(error instanceof Error ? error.message : "Could not process this PDF.")
    } finally {
      setIsUploading(false)
    }
  }

  const handleReset = () => {
    resetSession()
    setIsExamStarted(false)
    setDocumentName("")
    setProcessingStatus("")
  }

  if (isExamStarted) {
    return <ExaminationInterface documentName={documentName} onReset={handleReset} initialExamData={initialExamData} />
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header - Updated branding */}
      <header className="fixed top-0 left-0 right-0 z-50 py-4 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Zap className="w-5 h-5 text-primary" />
            <span className="text-sm">Lexicognition AI</span>
          </Link>
          <button
            type="button"
            onClick={() => setShowKeys((open) => !open)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <KeyRound className="h-4 w-4" /> API keys
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-20">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl md:text-6xl font-bold mb-4" style={{ fontFamily: "var(--font-syne)" }}>
            <span className="text-foreground italic">Examination </span>
            <span className="gradient-text">Controller</span>
          </h1>
          <p className="text-muted-foreground text-lg">
            Upload your PDF document to begin the intelligent examination process
          </p>
        </motion.div>

        <div className="mb-8 flex w-full flex-col items-center gap-3">
          <ApiKeysPanel open={showKeys} onOpenChange={setShowKeys} onSaved={() => setUploadError("")} />
          {uploadError && <p className="max-w-xl rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300" role="alert">{uploadError}</p>}
        </div>

        {/* 3D Sphere and Upload Area */}
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* 3D Sphere */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <UploadSphere />
          </motion.div>

          {/* Upload Area - Pass processing status */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <FileUpload onFileUpload={handleFileUpload} isUploading={isUploading} processingStatus={processingStatus} />
          </motion.div>
        </div>
      </div>
    </main>
  )
}
