import React, { useState, useEffect, useCallback } from 'react';
import { monitoringApi } from '../api/monitoring.api';
import { CurrentMetric, HistoricalMetric, AIAnalysisResponse } from '../types/monitoring.types';

export const useMonitoring = () => {
  const [current, setCurrent] = useState<CurrentMetric | null>(null);
  const [history, setHistory] = useState<HistoricalMetric[]>([]);
  const [analysis, setAnalysis] = useState<AIAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [currentData, historyData] = await Promise.all([
        monitoringApi.getCurrent(),
        monitoringApi.getHistory(),
      ]);
      setCurrent(currentData);
      setHistory(historyData.metrics);
      setError(null);
    } catch (err) {
      setError('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const runAnalysis = async () => {
    if (!current) return;
    setAnalyzing(true);
    try {
      const result = await monitoringApi.analyze({
        currentValue: current.value,
        threshold: 1024 * 1024 * 512,
      });
      setAnalysis(result);
    } catch (err) {
      setError('AI 분석 요청 중 오류가 발생했습니다.');
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { current, history, analysis, loading, analyzing, error, runAnalysis, fetchData };
};
