'use client';

import { CopyIcon, IconButton, useToast } from '@plp/ui';

export interface CopyAddressButtonProps {
  /** The full address to copy, e.g. "https://smilecare.payload.site". */
  url: string;
  /** Host shown in the button's name, e.g. "smilecare.payload.site". */
  host: string;
}

/** Copies a site address to the clipboard and confirms with a toast. */
export function CopyAddressButton({ url, host }: CopyAddressButtonProps) {
  const { toast } = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast({ tone: 'success', title: 'Đã sao chép', description: url });
    } catch (error) {
      console.error('Copying the site address failed', error);
      toast({
        tone: 'danger',
        title: 'Chưa sao chép được',
        description: 'Trình duyệt không cho phép sao chép. Hãy chọn địa chỉ rồi sao chép thủ công.',
      });
    }
  }

  return (
    <IconButton
      aria-label={`Sao chép địa chỉ ${host}`}
      tooltip="Sao chép địa chỉ"
      variant="secondary"
      icon={<CopyIcon size={18} />}
      onClick={() => {
        void copy();
      }}
    />
  );
}
