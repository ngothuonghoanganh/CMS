'use client';

import type { PrivacySettings } from '@plp/contracts';
import { Callout } from '@plp/ui';
import { useState } from 'react';
import { DataRequestsSection } from '../data-requests/DataRequestsSection';
import type { DataRequestsData } from '../data-requests/load-data-requests';
import { ConsentTextCard } from './ConsentTextCard';
import { PrivacySettingsForm } from './PrivacySettingsForm';
import styles from './PrivacyScreen.module.css';

export interface PrivacyScreenProps {
  siteId: string;
  settings: PrivacySettings;
  /** Only the workspace owner changes these settings (ADR-004); editors read them. */
  canEdit: boolean;
  /** The requests from people who sent a form; null for editors, who do not handle them. */
  dataRequests: DataRequestsData | null;
}

/**
 * "Dữ liệu cá nhân & đồng ý" (board 12, ADR-017): who collects the data, the policy link, how long
 * leads are kept, and the consent texts every form shows.
 */
export function PrivacyScreen({
  siteId,
  settings: initial,
  canEdit,
  dataRequests,
}: PrivacyScreenProps) {
  const [settings, setSettings] = useState(initial);
  return (
    <div className={styles.screen}>
      <Callout tone="info">
        Nội dung mặc định là điểm khởi đầu, không phải tư vấn pháp lý. Hãy nhờ người phụ trách pháp
        lý của doanh nghiệp kiểm tra trước khi dùng.
      </Callout>
      {canEdit ? null : (
        <Callout tone="info">
          Chỉ Owner của workspace được thay đổi dữ liệu cá nhân và đồng ý, và xử lý yêu cầu từ người
          gửi form.
        </Callout>
      )}
      <div className={styles.columns}>
        <PrivacySettingsForm
          siteId={siteId}
          settings={settings}
          canEdit={canEdit}
          onSaved={setSettings}
        />
        <ConsentTextCard
          siteId={siteId}
          current={settings.currentConsent}
          controllerName={settings.privacy?.controllerName ?? null}
          canEdit={canEdit}
          onSaved={(currentConsent) => {
            setSettings((value) => ({ ...value, currentConsent }));
          }}
        />
      </div>
      {dataRequests === null ? null : (
        <DataRequestsSection
          siteId={siteId}
          initial={dataRequests.list}
          loadedAt={dataRequests.loadedAt}
        />
      )}
    </div>
  );
}
