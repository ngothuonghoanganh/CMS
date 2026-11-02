import { type Access, can, holdersOf, type Membership, type SiteListItem } from '@plp/contracts';
import { BrowserIcon, ButtonLink, Card, EmptyState, PlusIcon, VisuallyHidden } from '@plp/ui';
import Link from 'next/link';
import { hostOf } from '../../lib/site-url';
import { newSiteHref, siteHref } from '../shell/navigation';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { siteInitial, siteTileStyle } from '../shell/site-tile';
import styles from './SitesScreen.module.css';

export interface SitesScreenProps {
  workspace: Membership['workspace'];
  /** The user's role: "Tạo site" and the lead column follow it (ADR-020). */
  role: Access;
  /** Sites the user is kept to, or null for the whole workspace (ADR-020). */
  siteIds: Membership['siteIds'];
  /** The sites the user may open, oldest first, with their counts (ADR-028). */
  sites: readonly SiteListItem[];
}

/** Why the list is empty and, for who may, the first site to create. */
function NoSites({ workspace, role, siteIds }: Omit<SitesScreenProps, 'sites'>) {
  if (can(role, 'sites.manage')) {
    return (
      <EmptyState
        headingLevel={3}
        icon={<BrowserIcon size={24} />}
        title="Chưa có site nào"
        description="Mỗi site là trang web của một khách hàng, với địa chỉ và bộ trang riêng. Tạo site đầu tiên để bắt đầu."
        action={
          <ButtonLink
            as={Link}
            href={newSiteHref(workspace.id)}
            leadingIcon={<PlusIcon size={16} />}
          >
            Tạo site đầu tiên
          </ButtonLink>
        }
      />
    );
  }
  return (
    <EmptyState
      headingLevel={3}
      icon={<BrowserIcon size={24} />}
      title="Chưa có site nào"
      description={
        siteIds === null
          ? `${workspace.name} chưa có site nào. Chỉ ${holdersOf('sites.manage')} tạo được site; site mới sẽ hiện ở đây.`
          : `Bạn chưa được giao site nào trong ${workspace.name}. Nhờ ${holdersOf('members.manage')} giao site cho bạn.`
      }
    />
  );
}

/**
 * "Sites" (Sidebar v2, ADR-028): every site the user may open, with its public address, pages,
 * live pages and, for roles that see leads, the leads of the last 7 days. Each row opens the
 * site's pages.
 */
export function SitesScreen({ workspace, role, siteIds, sites }: SitesScreenProps) {
  const canCreate = can(role, 'sites.manage');
  const seesLeads = can(role, 'leads.view');
  return (
    <PageContainer>
      <PageHeader
        context={workspace.name}
        title="Sites"
        description="Trang web của từng khách hàng. Mở một site để xem và làm việc với các trang của nó."
        actions={
          canCreate ? (
            <ButtonLink
              as={Link}
              href={newSiteHref(workspace.id)}
              leadingIcon={<PlusIcon size={16} />}
            >
              Tạo site
            </ButtonLink>
          ) : undefined
        }
      />

      <Card as="section" padding="none" aria-labelledby="sites-heading">
        <h2 id="sites-heading" className={styles.srOnly}>
          Danh sách site
        </h2>
        {sites.length === 0 ? (
          <NoSites workspace={workspace} role={role} siteIds={siteIds} />
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">SITE</th>
                  <th scope="col" className={styles.number}>
                    TRANG
                  </th>
                  <th scope="col" className={styles.number}>
                    ĐANG LIVE
                  </th>
                  {seesLeads ? (
                    <th scope="col" className={styles.number}>
                      LEAD 7 NGÀY
                    </th>
                  ) : null}
                  <th scope="col" className={styles.actionsColumn}>
                    <VisuallyHidden>Thao tác</VisuallyHidden>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.id}>
                    <td>
                      <div className={styles.siteCell}>
                        <span
                          className={styles.tile}
                          style={siteTileStyle(site)}
                          aria-hidden="true"
                        >
                          {siteInitial(site)}
                        </span>
                        <div className={styles.stack}>
                          <Link href={siteHref(site.id)} className={styles.name}>
                            {site.name}
                          </Link>{' '}
                          <span className={styles.host}>
                            <VisuallyHidden>Địa chỉ: </VisuallyHidden>
                            {hostOf(site.publicOrigin)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className={styles.number}>{site.summary.pages}</td>
                    <td className={styles.number}>{site.summary.livePages}</td>
                    {seesLeads ? (
                      <td className={styles.number}>{site.summary.leadsLast7Days ?? '—'}</td>
                    ) : null}
                    <td className={styles.actionsColumn}>
                      <ButtonLink as={Link} href={siteHref(site.id)} variant="secondary">
                        Mở <VisuallyHidden>{site.name}</VisuallyHidden>
                      </ButtonLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
