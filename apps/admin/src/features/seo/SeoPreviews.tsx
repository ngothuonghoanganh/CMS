import type { Asset } from '@plp/contracts';
import {
  searchResultDescription,
  searchResultPath,
  searchResultTitle,
  siteInitial,
} from './seo-presentation';
import { ShareImageTile } from './ShareImageField';
import styles from './SeoScreen.module.css';

export interface SeoPreviewsProps {
  siteName: string;
  host: string;
  slug: string;
  /** The title the live page will use (`seoTitleOf`: SEO title, Hero heading or site name). */
  title: string;
  description: string;
  noindex: boolean;
  /** The image a shared link shows: the page's own, or the site default; null when neither. */
  image: Asset | null;
}

/** "Kết quả tìm kiếm" and "Khi chia sẻ qua Facebook, Zalo" previews of board 07. */
export function SeoPreviews({
  siteName,
  host,
  slug,
  title,
  description,
  noindex,
  image,
}: SeoPreviewsProps) {
  const trimmedDescription = description.trim();
  return (
    <aside aria-label="Xem trước" className={styles.previews}>
      <section aria-labelledby="seo-search-preview" className={styles.previewCard}>
        <h2 id="seo-search-preview" className={styles.previewTitle}>
          Kết quả tìm kiếm
        </h2>
        {noindex ? (
          <p className={styles.previewNote}>
            Trang sẽ không hiện trên công cụ tìm kiếm sau khi xuất bản.
          </p>
        ) : (
          <div className={styles.search}>
            <div className={styles.searchSite}>
              <span aria-hidden="true" className={styles.searchIcon}>
                {siteInitial(siteName)}
              </span>
              <span className={styles.searchSiteText}>
                <span className={styles.searchSiteName}>{siteName}</span>
                <span className={styles.searchPath}>{searchResultPath(host, slug)}</span>
              </span>
            </div>
            <span className={styles.searchTitle}>{searchResultTitle(title)}</span>
            {trimmedDescription === '' ? (
              <span className={styles.searchEmpty}>
                Chưa có mô tả: công cụ tìm kiếm sẽ tự lấy một đoạn chữ trong trang.
              </span>
            ) : (
              <span className={styles.searchDescription}>
                {searchResultDescription(trimmedDescription)}
              </span>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="seo-share-preview" className={styles.previewCard}>
        <h2 id="seo-share-preview" className={styles.previewTitle}>
          Khi chia sẻ qua Facebook, Zalo
        </h2>
        <div className={styles.share}>
          {/* Without an image the live page sends no og:image: the card is text only. */}
          {image === null ? null : <ShareImageTile asset={image} className={styles.shareImage} />}
          <div className={styles.shareBody}>
            <span className={styles.shareHost}>{host}</span>
            <span className={styles.shareTitle}>{searchResultTitle(title)}</span>
            {trimmedDescription === '' ? null : (
              <span className={styles.shareDescription}>{trimmedDescription}</span>
            )}
          </div>
        </div>
        {image === null ? (
          <p className={styles.previewNote}>
            Chưa có ảnh chia sẻ, nên link sẽ không có ảnh lớn. Chọn ảnh ở mục “Ảnh khi chia sẻ”.
          </p>
        ) : null}
        <p className={styles.previewNote}>
          Mạng xã hội lưu bản xem trước một thời gian, thay đổi có thể chưa hiện ngay với link đã
          chia sẻ.
        </p>
      </section>
    </aside>
  );
}
