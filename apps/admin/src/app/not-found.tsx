import { ButtonLink } from '@plp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CenteredPage } from '../features/shell/CenteredPage';
import { FormCard } from '../features/shell/FormCard';

export const metadata: Metadata = { title: 'Không tìm thấy trang' };

/**
 * Every miss in the admin, including a site or page of another workspace (ADR-003 answers 404),
 * so the message never reveals whether the resource exists.
 */
export default function NotFound() {
  return (
    <CenteredPage>
      <FormCard
        title="Không tìm thấy trang"
        description="Trang này không tồn tại hoặc bạn không có quyền xem. Kiểm tra lại đường dẫn, hoặc quay về danh sách site của bạn."
      >
        <ButtonLink as={Link} href="/">
          Về trang chính
        </ButtonLink>
      </FormCard>
    </CenteredPage>
  );
}
