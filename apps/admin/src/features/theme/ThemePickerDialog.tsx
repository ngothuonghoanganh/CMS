'use client';

import { endpoints, type Site, type ThemePresetId } from '@plp/contracts';
import { Button, Callout, Dialog, useToast } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import styles from './theme.module.css';
import { ThemePicker } from './ThemePicker';

export interface ThemePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: Site;
  /** Only the owner changes site settings; editors see the dialog read-only. */
  canEdit: boolean;
  /** Called with the saved site so the caller (e.g. the editor canvas) updates at once. */
  onSiteUpdated: (site: Site) => void;
}

/** "Giao diện site · màu & chữ" from the editor: pick a preset and apply it to the whole site. */
export function ThemePickerDialog({
  open,
  onOpenChange,
  site,
  canEdit,
  onSiteUpdated,
}: ThemePickerDialogProps) {
  const { toast } = useToast();
  const [choice, setChoice] = useState<ThemePresetId>(site.themePresetId);
  const mutation = useMutation({
    mutationFn: (themePresetId: ThemePresetId) =>
      api(endpoints.updateSite, [site.id], { body: { themePresetId } }),
    onSuccess: (updated) => {
      onSiteUpdated(updated);
      toast({ title: 'Đã đổi giao diện site', tone: 'success' });
      onOpenChange(false);
    },
    onError: (error) => {
      reportUnexpected('Changing the site theme failed', error);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) {
          onOpenChange(next);
        }
      }}
      title="Giao diện site"
      description="Màu và kiểu chữ dùng chung cho mọi trang của site. Mọi bảng màu đều đạt tương phản AA."
      footerStart={
        canEdit ? null : <span className={styles.readOnly}>Chỉ Owner đổi được giao diện site</span>
      }
      footer={
        canEdit ? (
          <>
            <Button
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Hủy
            </Button>
            <Button
              loading={mutation.isPending}
              disabled={choice === site.themePresetId}
              onClick={() => {
                mutation.mutate(choice);
              }}
            >
              Áp dụng giao diện
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Đóng
          </Button>
        )
      }
    >
      <div className={styles.dialogBody}>
        <ThemePicker
          value={choice}
          onChange={setChoice}
          disabled={!canEdit || mutation.isPending}
        />
        {mutation.isError ? (
          <Callout tone="danger" role="alert">
            {problemMessage(mutation.error)}
          </Callout>
        ) : null}
      </div>
    </Dialog>
  );
}
