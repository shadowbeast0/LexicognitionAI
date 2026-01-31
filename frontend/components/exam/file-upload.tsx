"use client"

import type React from "react"
import { useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Upload, FileText, X, Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"

interface FileUploadProps {
  onFileUpload: (file: File, enableVision: boolean) => void
  isUploading: boolean
  processingStatus?: string
}

export function FileUpload({ onFileUpload, isUploading, processingStatus }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [visionEnabled, setVisionEnabled] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file && file.type === "application/pdf") {
        setSelectedFile(file)
        onFileUpload(file, visionEnabled)
      }
    },
    [onFileUpload, visionEnabled],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file && file.type === "application/pdf") {
        setSelectedFile(file)
        onFileUpload(file, visionEnabled)
      }
    },
    [onFileUpload, visionEnabled],
  )
  const toggleVision = () => setVisionEnabled((prev) => !prev)
  const clearFile = useCallback(() => {
    setSelectedFile(null)
  }, [])

  return (
    <div className="w-full max-w-xl mx-auto">
      {!selectedFile && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleVision}
            className={`gap-2 text-xs transition-all duration-300 border ${
              visionEnabled 
                ? "border-primary/20 bg-primary/10 text-primary hover:bg-primary/20" 
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            }`}
            title={visionEnabled ? "Vision Enabled: Will scan for diagrams" : "Vision Disabled: Text only"}
          >
            {visionEnabled ? (
              <>
                <Eye className="w-4 h-4" />
                <span>Vision On</span>
              </>
            ) : (
              <>
                <EyeOff className="w-4 h-4" />
                <span>Vision Off</span>
              </>
            )}
          </Button>
        </div>
      )}
      <AnimatePresence mode="wait">
        {selectedFile ? (
          <motion.div
            key="selected"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-card rounded-2xl p-8"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center">
                <FileText className="w-7 h-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              {isUploading ? (
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              ) : (
                <button
                  onClick={clearFile}
                  className="p-2 hover:bg-secondary rounded-lg transition-colors"
                  aria-label="Remove file"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              )}
            </div>
            {isUploading && (
              <div className="mt-6 space-y-4">
                <div className="h-1 bg-secondary rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary"
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 3 }}
                  />
                </div>
                <div className="space-y-2">
                  <ProcessingStep
                    text="Reading PDF Bytes..."
                    isActive={processingStatus === "reading"}
                    isComplete={["parsing", "indexing", "generating"].includes(processingStatus || "")}
                  />
                  <ProcessingStep
                    text="Ingesting Text & Visuals (LlamaParse)..."
                    isActive={processingStatus === "parsing"}
                    isComplete={["indexing", "generating"].includes(processingStatus || "")}
                  />
                  <ProcessingStep
                    text="Constructing Atomic Index..."
                    isActive={processingStatus === "indexing"}
                    isComplete={processingStatus === "generating"}
                  />
                  <ProcessingStep
                    text="Generating Conceptual Questions..."
                    isActive={processingStatus === "generating"}
                    isComplete={false}
                  />
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="upload"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative rounded-2xl border-2 border-dashed p-12 transition-all duration-300 ${
              isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 bg-card/30"
            }`}
          >
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: "var(--font-syne)" }}>
                {"Drag & drop your PDF here"}
              </h3>
              <p className="text-muted-foreground mb-6">or click the button below to browse</p>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-8">
                <FileText className="w-4 h-4 mr-2" />
                Browse Files
              </Button>
              <p className="text-sm text-muted-foreground mt-4">Maximum file size: 50MB</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ProcessingStep({ text, isActive, isComplete }: { text: string; isActive: boolean; isComplete: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-300 ${
        isActive
          ? "bg-white/10 backdrop-blur-sm shadow-lg shadow-primary/20"
          : isComplete
            ? "bg-success/5"
            : "bg-transparent"
      }`}
    >
      {isComplete ? (
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.4, type: "spring", stiffness: 200 }}
        >
          <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
        </motion.div>
      ) : isActive ? (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="w-5 h-5 text-primary shrink-0" />
        </motion.div>
      ) : (
        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
      )}
      <motion.span
        animate={
          isActive
            ? { color: ["rgba(255, 255, 255, 0.8)", "rgba(255, 255, 255, 1)"] }
            : { color: isComplete ? "rgba(255, 255, 255, 0.6)" : "rgba(255, 255, 255, 0.4)" }
        }
        transition={isActive ? { duration: 0.8, repeat: Infinity, repeatType: "reverse" } : { duration: 0.3 }}
        className={`text-sm font-medium transition-all duration-300 ${
          isActive
            ? "text-white"
            : isComplete
              ? "text-muted-foreground"
              : "text-muted-foreground/50"
        }`}
      >
        {text}
      </motion.span>
    </motion.div>
  )
}
