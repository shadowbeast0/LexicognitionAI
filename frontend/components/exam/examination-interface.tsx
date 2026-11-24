"use client"

import { generateFollowup, submitAnswer } from "@/lib/engine"
import type React from "react"
import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, RotateCcw, ArrowRight, MessageCircle, Loader2, SkipForward, PartyPopper } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ExamSidebar } from "@/components/exam/exam-sidebar"
import { MessageBubble } from "@/components/exam/message-bubble"
import { GradeCard } from "@/components/exam/grade-card"
import { mockQuestions, generateMockGrade, type Evidence, type GradeResult } from "@/lib/mock-data"

interface Message {
  id: string
  role: "examiner" | "student"
  content: string
  timestamp: string
  gradeResult?: GradeResult
}

interface ExaminationInterfaceProps {
  documentName: string
  onReset: () => void
  initialExamData: any
}

export function ExaminationInterface({ documentName, onReset, initialExamData }: ExaminationInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [isTyping, setIsTyping] = useState(false)
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null)
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([])
  const [isFollowUp, setIsFollowUp] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [followUpUsed, setFollowUpUsed] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [totalQuestions, setTotalQuestions] = useState(0)
  const [currentQuestionText, setCurrentQuestionText] = useState("")
  const [pendingNextQuestion, setPendingNextQuestion] = useState<string | null>(null)
  const [isExamFinished, setIsExamFinished] = useState(false)
  const [isRetry, setIsRetry] = useState(false)
  const [lastGradeResult, setLastGradeResult] = useState<GradeResult | null>(null) // Preserve grade for follow-up skip
  const [showActionsOnly, setShowActionsOnly] = useState(false) // Show only action buttons after skipping follow-up

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, gradeResult])

  // Initial welcome message and first question
  useEffect(() => {
    if (initialExamData) {
      setMessages([
        {
          id: "welcome",
          role: "examiner",
          content: `Welcome to the examination. I have analyzed the document "${documentName}". Let us begin.`,
          timestamp: new Date().toLocaleTimeString(),
        },
        {
          id: "q1",
          role: "examiner",
          content: `**Question 1:** ${initialExamData.first_question}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ])
      setTotalQuestions(initialExamData.total_questions)
      setCurrentQuestionText(initialExamData.first_question)
    }
  }, [documentName, initialExamData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isTyping) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "student",
      content: inputValue,
      timestamp: new Date().toLocaleTimeString(),
    }

    setMessages((prev) => [...prev, userMessage])
    const answer = inputValue
    setInputValue("")
    setIsTyping(true)
    setGradeResult(null)

    try {
      const data = await submitAnswer({
        answer: answer,
        question_context: (isFollowUp || isRetry) ? currentQuestionText : null,
        is_retry_or_followup: isFollowUp || isRetry,
      })

      // Process grade data
      const gradeData = data.grade_data
      
      // Extract evidence from backend response
      const evidence: Evidence[] = gradeData.evidence || []
      
      const grade: GradeResult = {
        grade: gradeData.score >= 8 ? "PASS" : gradeData.score >= 5 ? "REVIEW" : "FAIL",
        feedback: gradeData.feedback,
        perfectAnswer: gradeData.perfect_answer,
        evidence: evidence,
      }

      setGradeResult(grade)
      
      // Replace evidence for current question (not accumulate)
      setEvidenceList(evidence)

      // Store next question for later - DON'T show it automatically
      // Wait for user to click "Next Question" button
      if (data.is_finished) {
        setIsExamFinished(true)
      } else {
        setPendingNextQuestion(data.next_question)
      }
      
      // Reset retry flag after successful grading
      setIsRetry(false)

    } catch (error) {
      console.error('Submit error:', error)
      // Fallback to mock grade
      const grade = generateMockGrade(currentQuestion)
      setGradeResult(grade)
      setEvidenceList(grade.evidence)
    } finally {
      setIsTyping(false)
    }
  }

  const handleRetry = () => {
    setMessages((prev) => prev.slice(0, -1))
    setGradeResult(null)
    setIsRetry(true)
  }

  const handleFollowUp = async () => {
    // Save current grade to chat history before clearing so it stays visible
    if (gradeResult) {
      const gradeMessage: Message = {
        id: `grade-${Date.now()}`,
        role: "examiner",
        content: "",
        timestamp: new Date().toLocaleTimeString(),
        gradeResult: gradeResult,
      }
      setMessages((prev) => [...prev, gradeMessage])
    }
    
    setIsFollowUp(true)
    setFollowUpUsed(true)
    setLastGradeResult(gradeResult)
    setGradeResult(null)
    setIsTyping(true)

    try {
      const data = await generateFollowup()

      const followUpMessage: Message = {
        id: `followup-${Date.now()}`,
        role: "examiner",
        content: `**Follow-up Question:** ${data.followup_question}`,
        timestamp: new Date().toLocaleTimeString(),
      }

      setMessages((prev) => [...prev, followUpMessage])
      setCurrentQuestionText(data.followup_question)

    } catch (error) {
      console.error('Followup error:', error)
      // Fallback
      const followUpMessage: Message = {
        id: `followup-${Date.now()}`,
        role: "examiner",
        content:
          "**Follow-up Question:** Can you elaborate more on the key concepts you mentioned? What specific evidence from the document supports your answer?",
        timestamp: new Date().toLocaleTimeString(),
      }
      setMessages((prev) => [...prev, followUpMessage])
    } finally {
      setIsTyping(false)
    }
  }

  const handleSkipQuestion = async () => {
    const skipUserMsg: Message = {
      id: `skip-user-${Date.now()}`,
      role: "student",
      content: isFollowUp ? "*[Skipped Follow-up]*" : "*[Skipped Question]*",
      timestamp: new Date().toLocaleTimeString(),
    }

    setMessages((prev) => [...prev, skipUserMsg])
    setIsTyping(true)

    // If skipping a follow-up, don't call backend - just return to waiting for next main question action
    if (isFollowUp) {
      const skipExaminerMsg: Message = {
        id: `skip-examiner-${Date.now()}`,
        role: "examiner",
        content: "**Follow-up Skipped.** You may proceed to the next question.",
        timestamp: new Date().toLocaleTimeString(),
      }
      setMessages((prev) => [...prev, skipExaminerMsg])
      setIsTyping(false)
      setIsFollowUp(false)
      setFollowUpUsed(true)
      setShowActionsOnly(true)
      return
    }

    try {
      const data = await submitAnswer({
        answer: "USER_SKIPPED_THOUGHTFULLY",
        question_context: currentQuestionText,
        is_retry_or_followup: false,
      })

      const skipExaminerMsg: Message = {
        id: `skip-examiner-${Date.now()}`,
        role: "examiner",
        content: "**Question Skipped.** Moving to the next topic...",
        timestamp: new Date().toLocaleTimeString(),
      }

      setMessages((prev) => [...prev, skipExaminerMsg])

      // Check if exam is finished BEFORE trying to show next question
      if (data.is_finished) {
        // Use finishViva for proper conclusion message
        finishViva(true)
      } else if (data.next_question && data.next_question !== "EXAM_COMPLETED") {
        const nextQ = currentQuestion + 1
        setCurrentQuestion(nextQ)
        
        // Visual question is Q6 (index 5 in 0-based), display as "Question 6 (Visual Analysis)"
        const displayNum = nextQ + 1
        const qLabel = displayNum === 6 ? `**Question ${displayNum} (Visual Analysis):**` : `**Question ${displayNum}:**`
        
        const nextQuestionMessage: Message = {
          id: `q${nextQ + 1}`,
          role: "examiner",
          content: `${qLabel} ${data.next_question}`,
          timestamp: new Date().toLocaleTimeString(),
        }
        setMessages((prev) => [...prev, nextQuestionMessage])
        setCurrentQuestionText(data.next_question)
      } else {
        // Fallback: if next_question is EXAM_COMPLETED or missing
        finishViva(true)
      }

    } catch (error) {
      console.error('Skip error:', error)
      // Fallback
      const skipExaminerMsg: Message = {
        id: `skip-examiner-${Date.now()}`,
        role: "examiner",
        content: "**Question Skipped.** Moving to the next topic...",
        timestamp: new Date().toLocaleTimeString(),
      }
      setMessages((prev) => [...prev, skipExaminerMsg])
      setCurrentQuestion(prev => prev + 1)
    } finally {
      setIsTyping(false)
      setIsFollowUp(false)
      setFollowUpUsed(false)
      setIsRetry(false)
      setEvidenceList([]) // Clear evidence when skipping
    }
  }

  const finishViva = (skippedLast = false) => {
    setIsComplete(true)
    setGradeResult(null)

    let completeContent =
      "## Viva Concluded\n\nThe Examiner has finished the evaluation. Thank you for your participation."
    if (skippedLast) {
      completeContent += "\n\n*(Note: The exam ended because the final question was skipped.)*"
    }

    const completeMessage: Message = {
      id: "complete",
      role: "examiner",
      content: completeContent,
      timestamp: new Date().toLocaleTimeString(),
    }
    setMessages((prev) => [...prev, completeMessage])
  }

  const handleNextQuestion = async () => {
    // Save current grade to chat history before clearing
    if (gradeResult) {
      const gradeMessage: Message = {
        id: `grade-${Date.now()}`,
        role: "examiner",
        content: "", // Content is rendered via gradeResult
        timestamp: new Date().toLocaleTimeString(),
        gradeResult: gradeResult,
      }
      setMessages((prev) => [...prev, gradeMessage])
    }
    
    setGradeResult(null)
    setLastGradeResult(null) // Clear preserved grade
    setShowActionsOnly(false) // Reset actions-only state
    setIsFollowUp(false)
    setFollowUpUsed(false)
    setIsRetry(false)
    setEvidenceList([]) // Clear evidence for next question

    // Check if exam is finished
    if (isExamFinished || !pendingNextQuestion) {
      finishViva()
      return
    }

    // Show next question from stored pending question
    const nextQ = currentQuestion + 1
    setCurrentQuestion(nextQ)

    // Visual question is Q6 (index 5 in 0-based), display as "Question 6 (Visual Analysis)"
    const displayNum = nextQ + 1
    const qLabel = displayNum === 6 ? `**Question ${displayNum} (Visual Analysis):**` : `**Question ${displayNum}:**`

    const nextQuestionMessage: Message = {
      id: `q${nextQ + 1}`,
      role: "examiner",
      content: `${qLabel} ${pendingNextQuestion}`,
      timestamp: new Date().toLocaleTimeString(),
    }

    setMessages((prev) => [...prev, nextQuestionMessage])
    setCurrentQuestionText(pendingNextQuestion)
    setPendingNextQuestion(null) // Clear pending
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <ExamSidebar
        currentQuestion={currentQuestion + 1}
        totalQuestions={totalQuestions}
        evidenceList={evidenceList}
        isFollowUp={isFollowUp}
        onReset={onReset}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col ml-0 md:ml-80">
        {/* Header - Updated branding to Lexicognition AI */}
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-foreground" style={{ fontFamily: "var(--font-syne)" }}>
                ByteMe
              </h2>
              <p className="text-sm text-muted-foreground">Automated Viva Voce Board</p>
            </div>
            {/* Demo Badge */}
            <div className="ml-auto px-3 py-1 rounded-full bg-accent/20 text-accent text-xs font-medium">Lexicognition AI</div>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <AnimatePresence mode="popLayout">
              {messages.map((message) => (
                message.gradeResult ? (
                  // Render historical grade cards inline
                  <motion.div 
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    className="space-y-4"
                  >
                    <GradeCard result={message.gradeResult} />
                  </motion.div>
                ) : (
                  <MessageBubble key={message.id} message={message} />
                )
              ))}

              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-muted-foreground"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Examiner is typing...</span>
                </motion.div>
              )}

              {gradeResult && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <GradeCard result={gradeResult} />

                  {/* Action Buttons */}
                  {!isComplete && (
                    <div className="flex flex-wrap gap-3">
                      <Button variant="outline" onClick={handleRetry} className="rounded-full bg-transparent">
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Retry Submission
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleFollowUp}
                        disabled={followUpUsed}
                        className="rounded-full bg-transparent"
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        {followUpUsed ? "Follow-up (Max Depth)" : "Follow-up Question"}
                      </Button>
                      <Button
                        onClick={handleNextQuestion}
                        className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground"
                      >
                        Next Question
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Action buttons only (after skipping follow-up) */}
              {showActionsOnly && !gradeResult && !isComplete && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={handleNextQuestion}
                      className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      Next Question
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {isComplete && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center justify-center gap-3 p-6 rounded-2xl bg-primary/10 border border-primary/30"
                >
                  <PartyPopper className="w-8 h-8 text-primary" />
                  <span className="text-lg font-semibold text-foreground">Examination Complete!</span>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="sticky bottom-0 bg-background/80 backdrop-blur-xl border-t border-border px-4 md:px-6 py-4">
          <div className="max-w-3xl mx-auto space-y-3">
            {!isComplete && !gradeResult && !isTyping && (
              <Button
                variant="outline"
                onClick={handleSkipQuestion}
                className="w-full rounded-full bg-transparent border-dashed"
              >
                <SkipForward className="w-4 h-4 mr-2" />
                Skip Question
              </Button>
            )}
            <form onSubmit={handleSubmit} className="flex gap-3">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={isComplete ? "Examination complete" : "Type your answer to the Examiner..."}
                disabled={isTyping || isComplete || !!gradeResult}
                className="flex-1 bg-secondary/50 border border-border rounded-full px-6 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
              />
              <Button
                type="submit"
                disabled={!inputValue.trim() || isTyping || isComplete || !!gradeResult}
                className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground px-6"
              >
                <Send className="w-5 h-5" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
