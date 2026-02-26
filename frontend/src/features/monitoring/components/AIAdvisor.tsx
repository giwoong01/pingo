import React from 'react';
import { Brain, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { AIAnalysisResponse } from '../types/monitoring.types';

interface AIAdvisorProps {
  analysis: AIAnalysisResponse | null;
  loading: boolean;
  onAnalyze: () => void;
}

const AIAdvisor: React.FC<AIAdvisorProps> = ({ analysis, loading, onAnalyze }) => {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mt-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Brain className="w-6 h-6 text-indigo-600" />
          <h3 className="text-lg font-semibold">AI 메모리 어드바이저</h3>
        </div>
        <button
          onClick={onAnalyze}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 분석 중...</>
          ) : (
            '상태 분석하기'
          )}
        </button>
      </div>

      {!analysis && !loading && (
        <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
          분석 버튼을 눌러 현재 메모리 상태에 대한 AI 조언을 받아보세요.
        </div>
      )}

      {analysis && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="p-4 bg-indigo-50 rounded-lg">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-indigo-900">상태 진단</h4>
                <p className="text-sm text-indigo-800 mt-1 leading-relaxed">
                  {analysis.analysis}
                </p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-gray-700 mb-2">추천 조치 사항</h4>
            <div className="grid gap-2">
              {analysis.recommendations.map((rec, index) => (
                <div key={index} className="flex items-center space-x-2 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-gray-400">위험도 등급:</span>
            <span className={`text-xs font-bold uppercase ${
              analysis.severity === 'HIGH' ? 'text-red-600' : 'text-blue-600'
            }`}>
              {analysis.severity}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIAdvisor;