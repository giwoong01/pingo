import React from 'react';
import MainLayout from '@/layouts/MainLayout';
import Link from 'next/link';

export default function OpsHome() {
  const Card = ({ href, title, desc }: { href: string; title: string; desc: string }) => (
    <Link href={href} className="block p-6 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
      <div className="text-lg font-semibold text-gray-900">{title}</div>
      <div className="text-sm text-gray-600 mt-2">{desc}</div>
    </Link>
  );

  return (
    <MainLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">운영 설정</h1>
      <p className="text-gray-600 mb-8">클러스터/앱/룰/웹훅을 등록해서 멀티 앱 모니터링과 알림을 구성합니다.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card href="/ops/onboarding" title="Onboarding" desc="클러스터→앱/인스턴스→위젯/룰 생성 가이드" />
        <Card href="/ops/clusters" title="Clusters" desc="Prometheus endpoint + token 등록/검증" />
        <Card href="/ops/apps" title="Apps" desc="job 중심 앱 등록 (환경별 유니크 job)" />
        <Card href="/ops/instances" title="Instances" desc="클라우드 VM 인스턴스(IP) 등록 + Prometheus 타겟 매핑" />
        <Card href="/ops/rules" title="Rules" desc="프리셋 기반 룰 생성 + Advanced PromQL" />
        <Card href="/ops/webhooks" title="Webhooks" desc="Discord webhook 등록" />
        <Card href="/ops/workspace" title="Workspace" desc="멤버 초대/권한 변경/제거" />
      </div>
    </MainLayout>
  );
}
