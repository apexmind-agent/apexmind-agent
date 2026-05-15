'use client'

import React from 'react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorCount: number
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, errorCount: 0 }
  }

  static getDerivedStateFromError(error: Error, prevState: ErrorBoundaryState): ErrorBoundaryState {
    return { hasError: true, error, errorCount: prevState.errorCount + 1 }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error.message, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      const errorMsg = this.state.error?.message || 'Erro desconhecido'
      const errorStack = this.state.error?.stack?.split('\n').slice(0, 3).join('\n') || ''

      // Extract the most useful part of the error
      let shortError = errorMsg
      if (errorMsg.includes('Cannot read properties of undefined')) {
        const match = errorMsg.match(/Cannot read properties of undefined \(reading '([^']+)'\)/)
        if (match) {
          shortError = `Propriedade "${match[1]}" não encontrada em objeto undefined`
        }
      }

      return (
        <div className="flex flex-col items-center justify-center py-8 px-4">
          <div className="rounded-xl border border-red-500/30 bg-card/80 p-6 text-center max-w-lg w-full">
            <h3 className="mb-2 text-sm font-semibold text-red-400">Erro no componente</h3>
            <p className="mb-2 text-xs text-red-300 font-mono break-all">{shortError}</p>
            {errorStack && (
              <pre className="mb-3 text-[10px] text-muted-foreground bg-muted/30 p-2 rounded overflow-auto max-h-24 text-left">{errorStack}</pre>
            )}
            <div className="flex gap-2 justify-center">
              <button
                onClick={this.handleRetry}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Tentar Novamente
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
              >
                Recarregar Página
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
