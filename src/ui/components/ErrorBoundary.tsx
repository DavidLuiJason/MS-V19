import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { logError } from '../../data/repositories';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  screenName: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`ErrorBoundary caught in screen "${this.props.screenName}":`, error, errorInfo);
    logError(this.props.screenName, error.message, errorInfo.componentStack || error.stack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center h-full min-h-[300px]">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 text-rose-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-slate-100 mb-1">
            Error loading {this.props.screenName}
          </h2>
          <p className="text-xs text-slate-400 mb-4 max-w-xs break-words">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reload Screen
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
