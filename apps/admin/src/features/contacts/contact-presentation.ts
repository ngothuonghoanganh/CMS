import {
  type ContactCount,
  type ContactListItem,
  formatLeadPhone,
  leadSourceLabel,
  manualContactChannelShortLabels,
  type MergeReason,
  pageTitleLabel,
} from '@plp/contracts';

/** "312", or "9.999+" past the cap. */
export function contactCountLabel(count: ContactCount): string {
  const number = count.count.toLocaleString('vi-VN');
  return count.capped ? `${number}+` : number;
}

/** The second line of the name: the phone number, or the email of a profile without one. */
export function contactReachLine(contact: Pick<ContactListItem, 'phone' | 'email'>): string {
  if (contact.phone !== null) {
    return formatLeadPhone(contact.phone);
  }
  return contact.email ?? '—';
}

/** The source column of board 22: the last lead's page, then "facebook / cpc · 2 lead". */
export function contactSourceLines(contact: Pick<ContactListItem, 'source' | 'leadCount'>): {
  title: string;
  detail: string;
} {
  const leads = `${contact.leadCount} lead`;
  if (contact.source.kind === 'manual') {
    return {
      title: `Thêm tay · ${manualContactChannelShortLabels[contact.source.channel]}`,
      detail: `— · ${leads}`,
    };
  }
  return {
    title: pageTitleLabel(contact.source.page.title),
    detail: `${leadSourceLabel(contact.source.source)} · ${leads}`,
  };
}

/** "Lý do: tên giống nhau, cùng đăng ký trang Niềng răng trong 2 ngày". */
export function mergeReasonLabel(reason: MergeReason): string {
  if (reason.kind === 'email') {
    return 'Lý do: cùng email, khác số điện thoại';
  }
  const when = reason.days === 0 ? 'trong cùng ngày' : `trong ${reason.days} ngày`;
  return `Lý do: tên giống nhau, cùng đăng ký trang ${pageTitleLabel(reason.page.title)} ${when}`;
}

/** "Hiển thị 1–25 trên 312". */
export function rangeLabel(first: number, shown: number, total: ContactCount): string {
  if (shown === 0) {
    return `Hiển thị 0 trên ${contactCountLabel(total)}`;
  }
  return `Hiển thị ${first}–${first + shown - 1} trên ${contactCountLabel(total)}`;
}
