'use client';

import {
  type Access,
  DEFAULT_THEME_PRESET,
  type MarketplaceItemDetail,
  type Membership,
  templateIndustryLabels,
} from '@plp/contracts';
import {
  Button,
  Card,
  ChevronLeftIcon,
  DesktopIcon,
  Dialog,
  MobileIcon,
  SegmentedControl,
} from '@plp/ui';
import Link from 'next/link';
import { useState } from 'react';
import { formatDate } from '../../lib/format';
import { marketplaceHref } from '../shell/navigation';
import { PageContainer } from '../shell/PageHeader';
import { goalLabel } from '../templates/library-filters';
import {
  type PreviewDevice,
  previewDeviceLabels,
  TemplatePreview,
} from '../templates/TemplatePreview';
import { ItemPriceBox } from './ItemPriceBox';
import { includedParts } from './marketplace-filters';
import styles from './MarketplaceItemScreen.module.css';

export interface MarketplaceItemScreenProps {
  workspace: Membership['workspace'];
  role: Access;
  item: MarketplaceItemDetail;
}

/**
 * One marketplace item (board 31, ADR-036): its page in the default theme on a computer or a
 * phone, what it includes, the licence and the terms behind it, what an update and support cover,
 * and the price box, which claims a free item or shows the licence the workspace holds ("Mua mẫu"
 * comes with the payment, MP3).
 */
export function MarketplaceItemScreen({ workspace, role, item }: MarketplaceItemScreenProps) {
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [termsOpen, setTermsOpen] = useState(false);

  return (
    <PageContainer>
      <Link href={marketplaceHref(workspace.id)} className={styles.back}>
        <ChevronLeftIcon size={16} />
        Marketplace
      </Link>

      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.meta}>
            {goalLabel(item.goal)} · {templateIndustryLabels[item.industry]} ·{' '}
            {item.sections.length} section · v{item.version}
          </p>
          <h1 className={styles.title}>{item.name}</h1>
          <p className={styles.description}>{item.description}</p>
        </div>
        <SegmentedControl<PreviewDevice>
          aria-label="Xem theo thiết bị"
          value={device}
          onChange={setDevice}
          options={[
            {
              value: 'desktop',
              label: previewDeviceLabels.desktop,
              icon: <DesktopIcon size={16} />,
            },
            { value: 'mobile', label: previewDeviceLabels.mobile, icon: <MobileIcon size={16} /> },
          ]}
        />
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          <div className={styles.preview}>
            <TemplatePreview
              name={item.name}
              composition={item.composition}
              themePresetId={DEFAULT_THEME_PRESET}
              images={{}}
              siteName="Tên site"
              device={device}
            />
          </div>

          <div className={styles.cards}>
            <Card as="section" className={styles.info} aria-labelledby="mp-includes">
              <h2 id="mp-includes" className={styles.infoTitle}>
                Gồm những gì
              </h2>
              <p className={styles.infoText}>{includedParts(item).join(' · ')}</p>
            </Card>
            <Card as="section" className={styles.info} aria-labelledby="mp-licence">
              <h2 id="mp-licence" className={styles.infoTitle}>
                Giấy phép
              </h2>
              <p className={styles.infoText}>
                Dùng cho mọi site trong workspace mua. {item.terms.summary}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className={styles.termsButton}
                onClick={() => {
                  setTermsOpen(true);
                }}
              >
                Điều khoản giấy phép
              </Button>
            </Card>
            <Card as="section" className={styles.info} aria-labelledby="mp-support">
              <h2 id="mp-support" className={styles.infoTitle}>
                Cập nhật &amp; hỗ trợ
              </h2>
              <p className={styles.infoText}>
                Phiên bản mới miễn phí cho workspace đã sở hữu. {item.terms.support}
              </p>
            </Card>
          </div>

          <Card as="section" className={styles.info} aria-labelledby="mp-news">
            <h2 id="mp-news" className={styles.infoTitle}>
              Có gì mới ở v{item.version} · {formatDate(item.releasedOn)}
            </h2>
            <p className={styles.infoText}>{item.note}</p>
          </Card>
        </div>

        <aside aria-label="Giá" className={styles.aside}>
          <ItemPriceBox workspace={workspace} role={role} item={item} />
        </aside>
      </div>

      <Dialog
        open={termsOpen}
        onOpenChange={setTermsOpen}
        title="Điều khoản giấy phép"
        description={`Điều khoản v${item.terms.version}, áp dụng cho mọi mẫu trên marketplace.`}
      >
        <ol className={styles.terms}>
          {item.terms.licence.map((paragraph, index) => (
            <li key={index}>{paragraph}</li>
          ))}
        </ol>
      </Dialog>
    </PageContainer>
  );
}
