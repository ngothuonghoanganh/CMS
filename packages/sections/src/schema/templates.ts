import type {
  Composition,
  PageGoal,
  PageStyle,
  SectionInstance,
  SectionType,
  TemplateIndustry,
  TemplateSection,
} from '@plp/contracts';
import { pageStyleSchemes } from './blueprints.js';
import { setAtPath } from './paths.js';
import { createSectionInstance, samplePathsOf } from './registry.js';
import { benefit, faq, type SampleSection, testimonial } from './sample-sections.js';

/**
 * A template of the library that ships with the product (ADR-030). It lives in code and changes
 * through review: its `id` never changes, and its `version` goes up whenever its content does, so
 * a page records what it was made from and a user never gets a version they did not preview.
 */
export interface SystemTemplate {
  /** Stable, kebab-case with a hyphen (`systemTemplateIdSchema`). */
  id: string;
  version: number;
  /** The day this version was written, "YYYY-MM-DD". */
  updatedOn: string;
  name: string;
  /** One line for the library's card. */
  description: string;
  /** What the template is for, under its name on its own screen. */
  details: string;
  goal: PageGoal;
  industry: TemplateIndustry;
  /** The color rhythm of its sections, within the theme of the site it is used in (ADR-004). */
  style: PageStyle;
  sections: readonly SampleSection[];
}

const NONE = { kind: 'none' } as const;

function cta(label: string) {
  return { label, link: NONE };
}

function navbar(label: string, role: string): SampleSection {
  return { type: 'navbar', variant: 'logo-cta', label: role, sample: { cta: cta(label) } };
}

const footer: SampleSection = {
  type: 'footer',
  variant: 'basic',
  label: 'Chân trang · địa chỉ, giờ mở cửa',
  sample: {
    address: 'Địa chỉ của bạn',
    phone: 'Số điện thoại',
    hours: 'Giờ mở cửa, ví dụ: 8:00–20:00 mỗi ngày',
  },
};

const UPDATED_ON = '2026-11-02';

/*
 * Every text is sample text the publish checks remind to replace, and no section has an image: the
 * frames stay empty until the user picks the site's own photos (ADR-030). Only section types and
 * variants of the registry are used; `templates.spec.ts` parses each template with it.
 */
export const systemTemplates: readonly SystemTemplate[] = [
  {
    id: 'nha-khoa-uu-dai',
    version: 1,
    updatedOn: UPDATED_ON,
    name: 'Ưu đãi dịch vụ nha khoa',
    description: 'Hero ưu đãi, bác sĩ, cảm nhận khách, form đặt lịch tư vấn.',
    details:
      'Cho chiến dịch quảng cáo một dịch vụ cụ thể: nêu ưu đãi ngay đầu trang, giới thiệu bác sĩ, cảm nhận khách hàng và form đặt lịch tư vấn.',
    goal: 'lead',
    industry: 'dental_health',
    style: 'calm',
    sections: [
      navbar('Đặt lịch', 'Thanh điều hướng · nút đặt lịch'),
      {
        type: 'hero',
        variant: 'split',
        label: 'Hero · ưu đãi và nút đặt lịch',
        sample: {
          eyebrow: 'Ưu đãi tháng này · Số suất có hạn',
          heading: 'Tẩy trắng răng giảm 30% cho khách hàng mới',
          subheading:
            'Một hai câu về dịch vụ đang ưu đãi: ai nên làm, làm trong bao lâu và kết quả khách nhận được.',
          primaryCta: cta('Đặt lịch tư vấn'),
        },
      },
      {
        type: 'benefits',
        variant: 'grid',
        label: 'Lợi ích · 3 lý do chọn phòng khám',
        sample: {
          heading: 'Vì sao chọn phòng khám của chúng tôi',
          items: [
            benefit(
              'shield',
              'Bác sĩ nhiều năm kinh nghiệm',
              'Giới thiệu ngắn về đội ngũ bác sĩ và chứng chỉ chuyên môn.',
            ),
            benefit(
              'sparkles',
              'Thiết bị hiện đại',
              'Nêu máy móc, công nghệ giúp điều trị nhẹ nhàng và chính xác.',
            ),
            benefit(
              'clock',
              'Lịch hẹn linh hoạt',
              'Mở cửa cả cuối tuần, đặt lịch trước để không phải chờ.',
            ),
          ],
        },
      },
      {
        type: 'benefits',
        variant: 'alternate',
        label: 'Giới thiệu bác sĩ',
        sample: {
          heading: 'Đội ngũ bác sĩ',
          items: [
            benefit(
              'star',
              'Tên bác sĩ phụ trách',
              'Chuyên khoa, số năm kinh nghiệm và nơi đào tạo của bác sĩ.',
            ),
            benefit(
              'star',
              'Tên bác sĩ thứ hai',
              'Chuyên khoa, số năm kinh nghiệm và nơi đào tạo của bác sĩ.',
            ),
          ],
        },
      },
      {
        type: 'testimonials',
        variant: 'cards',
        label: 'Cảm nhận khách hàng',
        sample: {
          heading: 'Khách hàng nói gì sau khi điều trị',
          items: [
            testimonial(
              'Răng trắng hơn hẳn sau một buổi, bác sĩ giải thích rất kỹ trước khi làm.',
              'Tên khách hàng',
              'Khách hàng tẩy trắng răng',
            ),
            testimonial(
              'Phòng khám sạch sẽ, đặt lịch trước nên không phải chờ lâu.',
              'Tên khách hàng',
              'Khách hàng niềng răng',
            ),
            testimonial(
              'Chi phí được báo trước rõ ràng, không phát sinh thêm.',
              'Tên khách hàng',
              'Khách hàng cạo vôi răng',
            ),
          ],
        },
      },
      {
        type: 'faq',
        variant: 'accordion',
        label: 'Câu hỏi thường gặp',
        sample: {
          items: [
            faq('Ưu đãi áp dụng đến khi nào?', 'Ghi rõ ngày kết thúc ưu đãi và số suất còn lại.'),
            faq(
              'Tẩy trắng răng có đau không?',
              'Giải thích cảm giác khi làm và cách phòng khám giúp khách thoải mái.',
            ),
            faq(
              'Kết quả giữ được bao lâu?',
              'Nêu thời gian giữ màu răng và cách chăm sóc sau khi làm.',
            ),
          ],
        },
      },
      {
        type: 'lead_form',
        variant: 'stacked',
        label: 'Form đăng ký tư vấn',
        sample: {
          heading: 'Đặt lịch tư vấn miễn phí',
          description:
            'Để lại tên và số điện thoại, phòng khám gọi lại xác nhận lịch trong giờ làm việc.',
          submitLabel: 'Đặt lịch',
          successTitle: 'Đã nhận lịch hẹn của bạn',
          successMessage: 'Phòng khám sẽ gọi lại để xác nhận giờ khám trong giờ làm việc.',
        },
      },
      footer,
    ],
  },
  {
    id: 'phong-kham-gioi-thieu',
    version: 1,
    updatedOn: UPDATED_ON,
    name: 'Giới thiệu phòng khám',
    description: 'Câu chuyện phòng khám, dịch vụ, quy trình khám và nút gọi, nhắn Zalo.',
    details:
      'Trang giới thiệu cho phòng khám nha khoa hay y tế: ai đứng sau phòng khám, các dịch vụ chính, một buổi khám diễn ra thế nào và cách liên hệ nhanh qua điện thoại hoặc Zalo.',
    goal: 'about',
    industry: 'dental_health',
    style: 'minimal',
    sections: [
      navbar('Liên hệ', 'Thanh điều hướng · nút liên hệ'),
      {
        type: 'hero',
        variant: 'split',
        label: 'Hero · lời giới thiệu',
        sample: {
          eyebrow: 'Về phòng khám',
          heading: 'Chăm sóc nụ cười cho cả gia đình bạn',
          subheading:
            'Một hai câu về phòng khám: thành lập năm nào, phục vụ ai và điều làm phòng khám khác biệt.',
          primaryCta: cta('Đặt lịch khám'),
        },
      },
      {
        type: 'benefits',
        variant: 'alternate',
        label: 'Câu chuyện phòng khám',
        sample: {
          heading: 'Câu chuyện của chúng tôi',
          items: [
            benefit(
              'heart',
              'Phòng khám ra đời như thế nào',
              'Năm thành lập, người sáng lập và lý do mở phòng khám.',
            ),
            benefit(
              'heart',
              'Cam kết với bệnh nhân',
              'Điều mỗi bệnh nhân luôn nhận được khi đến khám.',
            ),
          ],
        },
      },
      {
        type: 'benefits',
        variant: 'grid',
        label: 'Dịch vụ chính',
        sample: {
          heading: 'Dịch vụ của phòng khám',
          items: [
            benefit('sparkles', 'Khám và tư vấn', 'Mô tả ngắn về dịch vụ khám tổng quát.'),
            benefit('shield', 'Điều trị chuyên sâu', 'Mô tả ngắn về các dịch vụ điều trị.'),
            benefit('smile', 'Thẩm mỹ nụ cười', 'Mô tả ngắn về các dịch vụ thẩm mỹ.'),
          ],
        },
      },
      {
        type: 'benefits',
        variant: 'steps',
        label: 'Quy trình một buổi khám',
        sample: {
          heading: 'Một buổi khám diễn ra thế nào',
          items: [
            benefit('check', 'Đặt lịch', 'Gọi điện hoặc nhắn Zalo để chọn giờ phù hợp.'),
            benefit(
              'check',
              'Khám và tư vấn',
              'Bác sĩ khám, giải thích tình trạng và báo chi phí trước.',
            ),
            benefit(
              'check',
              'Điều trị và theo dõi',
              'Điều trị theo lịch, phòng khám nhắc lịch tái khám.',
            ),
          ],
        },
      },
      {
        type: 'testimonials',
        variant: 'quote',
        label: 'Cảm nhận của bệnh nhân',
        sample: {
          items: [
            testimonial(
              'Nhận xét của một bệnh nhân lâu năm: điều họ yên tâm nhất mỗi lần đến phòng khám.',
              'Tên bệnh nhân',
              'Bệnh nhân từ năm …',
            ),
          ],
        },
      },
      {
        type: 'quick_contact',
        variant: 'buttons',
        label: 'Gọi / Zalo nhanh',
        sample: {
          heading: 'Cần tư vấn ngay?',
          text: 'Gọi điện hoặc nhắn Zalo, phòng khám trả lời trong giờ làm việc.',
          call: { label: 'Gọi phòng khám', link: { kind: 'phone', phone: '' } },
          zalo: { label: 'Nhắn Zalo', link: { kind: 'zalo', phone: '' } },
        },
      },
      footer,
    ],
  },
  {
    id: 'spa-dat-lich',
    version: 1,
    updatedOn: UPDATED_ON,
    name: 'Đặt lịch spa & làm đẹp',
    description: 'Gói liệu trình, hình trước/sau, câu hỏi thường gặp và form đặt lịch.',
    details:
      'Cho spa và thẩm mỹ viện muốn nhận lịch hẹn: giới thiệu các gói liệu trình, kết quả trước và sau, giải đáp thắc mắc và form đặt lịch ngay trên trang.',
    goal: 'lead',
    industry: 'spa_beauty',
    style: 'calm',
    sections: [
      navbar('Đặt lịch', 'Thanh điều hướng · nút đặt lịch'),
      {
        type: 'hero',
        variant: 'centered',
        label: 'Hero · lời mời đặt lịch',
        sample: {
          eyebrow: 'Thư giãn và làm đẹp',
          heading: 'Chăm sóc da chuyên sâu, đặt lịch chỉ trong một phút',
          subheading:
            'Một câu về không gian, liệu trình nổi bật và điều khách nhận được sau buổi đầu tiên.',
          primaryCta: cta('Đặt lịch ngay'),
        },
      },
      {
        type: 'benefits',
        variant: 'grid',
        label: 'Các gói liệu trình',
        sample: {
          heading: 'Gói liệu trình nổi bật',
          intro: 'Giá và thời gian của từng gói, để khách chọn trước khi đến.',
          items: [
            benefit(
              'leaf',
              'Chăm sóc da cơ bản',
              '60 phút: làm sạch sâu, cấp ẩm và thư giãn vùng mặt.',
            ),
            benefit('sparkles', 'Trẻ hóa da', '90 phút: liệu trình giúp da săn chắc và đều màu.'),
            benefit('heart', 'Thư giãn toàn thân', '90 phút: massage đá nóng và tinh dầu.'),
          ],
        },
      },
      {
        type: 'before_after',
        variant: 'side_by_side',
        label: 'Trước & sau liệu trình',
        sample: {
          heading: 'Kết quả sau 4 buổi chăm sóc',
          beforeCaption: 'Trước liệu trình',
          afterCaption: 'Sau 4 buổi',
          note: 'Kết quả có thể khác nhau tùy từng người.',
        },
      },
      {
        type: 'testimonials',
        variant: 'cards',
        label: 'Cảm nhận khách hàng',
        sample: {
          heading: 'Khách hàng nói gì',
          items: [
            testimonial(
              'Da mịn và sáng hơn sau liệu trình, không gian rất thư giãn.',
              'Tên khách hàng',
              'Khách hàng chăm sóc da',
            ),
            testimonial(
              'Nhân viên tư vấn kỹ, chọn đúng liệu trình cho da nhạy cảm của mình.',
              'Tên khách hàng',
              'Khách hàng trẻ hóa da',
            ),
            testimonial(
              'Đặt lịch nhanh, đến là được phục vụ ngay.',
              'Tên khách hàng',
              'Khách hàng massage',
            ),
          ],
        },
      },
      {
        type: 'faq',
        variant: 'accordion',
        label: 'Câu hỏi thường gặp',
        sample: {
          items: [
            faq(
              'Tôi có cần đặt lịch trước không?',
              'Nêu việc đặt lịch trước giúp khách không phải chờ và giữ được giờ mong muốn.',
            ),
            faq(
              'Liệu trình có hợp với da nhạy cảm không?',
              'Giải thích cách spa soi da và chọn sản phẩm cho từng loại da.',
            ),
            faq('Có thể đổi hoặc hủy lịch không?', 'Ghi rõ thời hạn và cách đổi, hủy lịch.'),
          ],
        },
      },
      {
        type: 'lead_form',
        variant: 'stacked',
        label: 'Form đặt lịch',
        sample: {
          heading: 'Đặt lịch chăm sóc',
          description: 'Để lại tên và số điện thoại, spa gọi lại xác nhận giờ hẹn cho bạn.',
          showMessage: true,
          submitLabel: 'Đặt lịch',
          successTitle: 'Đã nhận lịch hẹn của bạn',
          successMessage: 'Spa sẽ gọi lại xác nhận giờ hẹn trong giờ làm việc.',
        },
      },
      footer,
    ],
  },
  {
    id: 'spa-uu-dai-lieu-trinh',
    version: 1,
    updatedOn: UPDATED_ON,
    name: 'Ưu đãi liệu trình có thời hạn',
    description: 'Ưu đãi có hạn, điều kiện áp dụng, một lời khen nổi bật và form giữ suất.',
    details:
      'Cho chương trình khuyến mãi theo mùa của spa: mức ưu đãi và hạn dùng ngay đầu trang, điều kiện rõ ràng, một cảm nhận nổi bật và form để khách giữ suất.',
    goal: 'promo',
    industry: 'spa_beauty',
    style: 'bold',
    sections: [
      navbar('Nhận ưu đãi', 'Thanh điều hướng · nút nhận ưu đãi'),
      {
        type: 'hero',
        variant: 'centered',
        label: 'Hero · mức ưu đãi và hạn dùng',
        sample: {
          eyebrow: 'Chỉ đến hết ngày … · Còn … suất',
          heading: 'Giảm 40% liệu trình trẻ hóa da cho khách đặt trước',
          subheading: 'Nói rõ ai được nhận ưu đãi, nhận như thế nào và hạn cuối là khi nào.',
          primaryCta: cta('Giữ suất ưu đãi'),
        },
      },
      {
        type: 'benefits',
        variant: 'grid',
        label: 'Ưu đãi gồm những gì',
        sample: {
          heading: 'Ưu đãi gồm những gì',
          items: [
            benefit('star', 'Giảm 40% buổi đầu', 'Ghi rõ giá gốc và giá sau ưu đãi.'),
            benefit('heart', 'Tặng buổi soi da', 'Một buổi soi da miễn phí trước khi bắt đầu.'),
            benefit(
              'clock',
              'Giữ giá cả liệu trình',
              'Giá ưu đãi áp dụng cho các buổi tiếp theo của liệu trình.',
            ),
          ],
        },
      },
      {
        type: 'testimonials',
        variant: 'quote',
        label: 'Cảm nhận nổi bật',
        sample: {
          items: [
            testimonial(
              'Da mình đều màu hơn hẳn sau liệu trình, nhân viên tư vấn rất nhẹ nhàng.',
              'Tên khách hàng',
              'Khách hàng liệu trình trẻ hóa',
            ),
          ],
        },
      },
      {
        type: 'faq',
        variant: 'accordion',
        label: 'Điều kiện áp dụng',
        sample: {
          heading: 'Điều kiện áp dụng',
          items: [
            faq(
              'Ưu đãi áp dụng đến khi nào?',
              'Ghi rõ ngày bắt đầu, ngày kết thúc và số suất có hạn.',
            ),
            faq('Ai được nhận ưu đãi?', 'Nêu đối tượng được áp dụng, ví dụ khách hàng mới.'),
            faq(
              'Có dùng chung với ưu đãi khác không?',
              'Nói rõ ưu đãi có được cộng dồn với chương trình khác hay không.',
            ),
          ],
        },
      },
      {
        type: 'lead_form',
        variant: 'stacked',
        label: 'Form giữ suất ưu đãi',
        sample: {
          heading: 'Giữ suất ưu đãi trước khi hết hạn',
          description: 'Số suất có hạn. Để lại tên và số điện thoại để spa giữ suất cho bạn.',
          submitLabel: 'Giữ suất',
          successTitle: 'Đã giữ suất cho bạn',
          successMessage: 'Spa sẽ gọi lại để hẹn giờ trong giờ làm việc.',
        },
      },
      footer,
    ],
  },
  {
    id: 'tieng-anh-hoc-thu',
    version: 1,
    updatedOn: UPDATED_ON,
    name: 'Khóa học tiếng Anh trẻ em',
    description: 'Lộ trình học, giáo viên, cảm nhận phụ huynh và form đăng ký học thử.',
    details:
      'Cho trung tâm ngoại ngữ tuyển sinh: lộ trình học theo giai đoạn, đội ngũ giáo viên, cảm nhận của phụ huynh và form đăng ký buổi học thử miễn phí.',
    goal: 'lead',
    industry: 'education',
    style: 'calm',
    sections: [
      navbar('Học thử', 'Thanh điều hướng · nút học thử'),
      {
        type: 'hero',
        variant: 'split',
        label: 'Hero · lời mời học thử',
        sample: {
          eyebrow: 'Học thử miễn phí',
          heading: 'Tiếng Anh cho trẻ 6–12 tuổi, tự tin giao tiếp sau 6 tháng',
          subheading:
            'Một hai câu về phương pháp dạy, sĩ số lớp và điều phụ huynh thấy được ở con sau khóa học.',
          primaryCta: cta('Đăng ký học thử'),
        },
      },
      {
        type: 'benefits',
        variant: 'steps',
        label: 'Lộ trình học',
        sample: {
          heading: 'Lộ trình 3 giai đoạn',
          items: [
            benefit('check', 'Làm quen', 'Nghe và nói qua trò chơi, bài hát trong 3 tháng đầu.'),
            benefit('check', 'Giao tiếp', 'Phản xạ hội thoại theo những chủ đề quen thuộc.'),
            benefit('check', 'Tự tin', 'Thuyết trình ngắn và đọc hiểu đoạn văn.'),
          ],
        },
      },
      {
        type: 'benefits',
        variant: 'alternate',
        label: 'Giáo viên',
        sample: {
          heading: 'Đội ngũ giáo viên',
          items: [
            benefit('star', 'Tên giáo viên', 'Bằng cấp, chứng chỉ giảng dạy và số năm dạy trẻ em.'),
            benefit(
              'star',
              'Tên trợ giảng',
              'Vai trò trong lớp và kinh nghiệm làm việc với trẻ em.',
            ),
          ],
        },
      },
      {
        type: 'testimonials',
        variant: 'cards',
        label: 'Cảm nhận phụ huynh',
        sample: {
          heading: 'Phụ huynh nói gì',
          items: [
            testimonial(
              'Con mạnh dạn nói tiếng Anh hơn hẳn sau một học kỳ.',
              'Tên phụ huynh',
              'Phụ huynh bé lớp 3',
            ),
            testimonial(
              'Giáo viên gửi nhận xét sau mỗi buổi nên mình theo dõi được việc học của con.',
              'Tên phụ huynh',
              'Phụ huynh bé lớp 1',
            ),
            testimonial(
              'Lớp ít học sinh, con được nói nhiều trong mỗi buổi.',
              'Tên phụ huynh',
              'Phụ huynh bé lớp 5',
            ),
          ],
        },
      },
      {
        type: 'faq',
        variant: 'accordion',
        label: 'Câu hỏi thường gặp',
        sample: {
          items: [
            faq(
              'Buổi học thử kéo dài bao lâu?',
              'Nêu thời lượng buổi học thử và phụ huynh có được dự cùng không.',
            ),
            faq('Một lớp có bao nhiêu học sinh?', 'Ghi rõ sĩ số tối đa của mỗi lớp.'),
            faq(
              'Học phí tính như thế nào?',
              'Nêu học phí theo khóa hoặc theo tháng và các ưu đãi đi kèm.',
            ),
          ],
        },
      },
      {
        type: 'lead_form',
        variant: 'stacked',
        label: 'Form đăng ký học thử',
        sample: {
          heading: 'Đăng ký buổi học thử miễn phí',
          description:
            'Để lại tên phụ huynh và số điện thoại, trung tâm gọi lại để xếp lớp hợp với tuổi của con.',
          showMessage: true,
          submitLabel: 'Đăng ký học thử',
          successTitle: 'Đã nhận đăng ký học thử',
          successMessage: 'Trung tâm sẽ gọi lại để hẹn lịch học thử trong giờ làm việc.',
        },
      },
      footer,
    ],
  },
  {
    id: 'webinar-truc-tuyen',
    version: 1,
    updatedOn: UPDATED_ON,
    name: 'Webinar trực tuyến',
    description: 'Diễn giả, nội dung buổi học, câu hỏi thường gặp và form đăng ký tham dự.',
    details:
      'Cho buổi chia sẻ hay lớp học trực tuyến: thời gian và nền tảng ngay đầu trang, nội dung từng phần, diễn giả và form đăng ký có email để gửi link tham dự.',
    goal: 'event',
    industry: 'education',
    style: 'bold',
    sections: [
      navbar('Đăng ký', 'Thanh điều hướng · nút đăng ký'),
      {
        type: 'hero',
        variant: 'split',
        label: 'Hero · thời gian và nền tảng',
        sample: {
          eyebrow: '20:00 thứ Năm · Trực tuyến qua Zoom',
          heading: 'Tên buổi webinar và điều người tham dự học được',
          subheading: 'Giới thiệu ngắn về chủ đề, ai nên tham dự và thời lượng của buổi học.',
          primaryCta: cta('Đăng ký tham dự'),
        },
      },
      {
        type: 'benefits',
        variant: 'grid',
        label: 'Nội dung buổi học',
        sample: {
          heading: 'Bạn sẽ học được gì',
          items: [
            benefit('sparkles', 'Phần 1: Tổng quan', 'Bối cảnh và vì sao chủ đề này quan trọng.'),
            benefit('check', 'Phần 2: Thực hành', 'Ví dụ thực tế và các bước áp dụng ngay.'),
            benefit('smile', 'Phần 3: Hỏi đáp', 'Diễn giả trả lời trực tiếp câu hỏi của bạn.'),
          ],
        },
      },
      {
        type: 'benefits',
        variant: 'alternate',
        label: 'Diễn giả',
        sample: {
          heading: 'Diễn giả',
          items: [
            benefit('star', 'Tên diễn giả', 'Chức danh và kinh nghiệm nổi bật của diễn giả.'),
            benefit('star', 'Tên khách mời', 'Chức danh và chủ đề khách mời sẽ chia sẻ.'),
          ],
        },
      },
      {
        type: 'lead_form',
        variant: 'stacked',
        label: 'Form đăng ký tham dự',
        sample: {
          heading: 'Đăng ký tham dự miễn phí',
          description: 'Link tham dự được gửi qua email một ngày trước buổi học.',
          showEmail: true,
          submitLabel: 'Đăng ký tham dự',
          successTitle: 'Bạn đã đăng ký thành công',
          successMessage: 'Link tham dự sẽ được gửi tới email của bạn trước buổi học.',
        },
      },
      {
        type: 'faq',
        variant: 'accordion',
        label: 'Câu hỏi thường gặp',
        sample: {
          items: [
            faq('Webinar có mất phí không?', 'Nêu rõ buổi học miễn phí hay có phí.'),
            faq(
              'Tôi có xem lại được không?',
              'Cho biết người đăng ký có nhận bản ghi sau buổi học không.',
            ),
            faq(
              'Tôi cần chuẩn bị gì?',
              'Thiết bị, ứng dụng và tài liệu nên có trước khi vào buổi học.',
            ),
          ],
        },
      },
      footer,
    ],
  },
  {
    id: 'bat-dong-san-mo-ban',
    version: 1,
    updatedOn: UPDATED_ON,
    name: 'Sự kiện mở bán dự án',
    description: 'Thời gian sự kiện, tiện ích, chính sách bán hàng và form đăng ký tham dự.',
    details:
      'Cho sự kiện mở bán căn hộ hay nhà phố: thời gian và địa điểm ngay đầu trang, tiện ích nổi bật, chính sách bán hàng và form đăng ký tham dự để nhận bảng giá.',
    goal: 'event',
    industry: 'real_estate',
    style: 'bold',
    sections: [
      navbar('Đăng ký', 'Thanh điều hướng · nút đăng ký'),
      {
        type: 'hero',
        variant: 'split',
        label: 'Hero · thời gian và địa điểm',
        sample: {
          eyebrow: 'Sự kiện mở bán · Thời gian · Địa điểm',
          heading: 'Tên dự án và điểm nổi bật nhất của dự án',
          subheading:
            'Giới thiệu ngắn về vị trí, loại hình sản phẩm và quà tặng cho khách tham dự sự kiện.',
          primaryCta: cta('Đăng ký tham dự'),
        },
      },
      {
        type: 'benefits',
        variant: 'grid',
        label: 'Tiện ích dự án',
        sample: {
          heading: 'Tiện ích nổi bật',
          items: [
            benefit('leaf', 'Không gian xanh', 'Diện tích cây xanh, hồ bơi và khu vui chơi.'),
            benefit('shield', 'An ninh nhiều lớp', 'Bảo vệ, thẻ từ và camera suốt ngày đêm.'),
            benefit('star', 'Vị trí kết nối', 'Khoảng cách tới trung tâm, trường học, bệnh viện.'),
          ],
        },
      },
      {
        type: 'benefits',
        variant: 'steps',
        label: 'Chính sách bán hàng',
        sample: {
          heading: 'Chính sách bán hàng',
          items: [
            benefit('check', 'Giữ chỗ', 'Mức tiền giữ chỗ và thời hạn hoàn lại.'),
            benefit('check', 'Thanh toán', 'Tiến độ thanh toán và ưu đãi khi thanh toán sớm.'),
            benefit('check', 'Nhận nhà', 'Thời gian bàn giao dự kiến và tiêu chuẩn bàn giao.'),
          ],
        },
      },
      {
        type: 'faq',
        variant: 'accordion',
        label: 'Câu hỏi thường gặp',
        sample: {
          items: [
            faq(
              'Tham dự sự kiện có mất phí không?',
              'Nêu rõ sự kiện miễn phí và có quà tặng cho khách tham dự.',
            ),
            faq(
              'Tôi có được xem nhà mẫu không?',
              'Cho biết khách được tham quan nhà mẫu trong sự kiện hay không.',
            ),
            faq('Pháp lý dự án thế nào?', 'Tóm tắt giấy tờ pháp lý hiện có của dự án.'),
          ],
        },
      },
      {
        type: 'lead_form',
        variant: 'stacked',
        label: 'Form đăng ký tham dự',
        sample: {
          heading: 'Đăng ký tham dự và nhận bảng giá',
          description: 'Để lại thông tin, chuyên viên gửi bảng giá và giữ chỗ cho bạn tại sự kiện.',
          showEmail: true,
          submitLabel: 'Đăng ký tham dự',
          successTitle: 'Đã nhận đăng ký tham dự',
          successMessage: 'Chuyên viên sẽ gọi lại xác nhận chỗ và gửi bảng giá cho bạn.',
        },
      },
      footer,
    ],
  },
  {
    id: 'bat-dong-san-danh-sach-cho',
    version: 1,
    updatedOn: UPDATED_ON,
    name: 'Danh sách chờ ra mắt dự án',
    description: 'Một thông điệp, ba lợi ích khi đăng ký sớm và form để lại email.',
    details:
      'Cho dự án sắp ra mắt: một thông điệp rõ ràng, ba lý do nên đăng ký sớm và form để lại email để nhận thông tin trước ngày mở bán.',
    goal: 'waitlist',
    industry: 'real_estate',
    style: 'minimal',
    sections: [
      navbar('Đăng ký sớm', 'Thanh điều hướng · nút đăng ký'),
      {
        type: 'hero',
        variant: 'centered',
        label: 'Hero · thông điệp ra mắt',
        sample: {
          eyebrow: 'Sắp ra mắt',
          heading: 'Tên dự án và lợi ích lớn nhất cho người mua',
          subheading: 'Một câu về vị trí, loại hình sản phẩm và thời gian dự kiến mở bán.',
          primaryCta: cta('Nhận thông tin sớm'),
        },
      },
      {
        type: 'lead_form',
        variant: 'stacked',
        label: 'Form đăng ký danh sách chờ',
        sample: {
          heading: 'Nhận thông tin trước ngày mở bán',
          description: 'Để lại email và số điện thoại để có tên trong danh sách ưu tiên.',
          showEmail: true,
          submitLabel: 'Đăng ký',
          successTitle: 'Bạn đã có tên trong danh sách chờ',
          successMessage: 'Chúng tôi sẽ gửi thông tin dự án cho bạn trước ngày mở bán.',
        },
      },
      {
        type: 'benefits',
        variant: 'grid',
        label: 'Lợi ích khi đăng ký sớm',
        sample: {
          heading: 'Vì sao nên đăng ký sớm',
          items: [
            benefit('star', 'Chọn căn trước', 'Người đăng ký sớm được chọn vị trí trước.'),
            benefit('heart', 'Ưu đãi riêng', 'Chiết khấu chỉ dành cho danh sách chờ.'),
            benefit('clock', 'Thông tin sớm nhất', 'Nhận bảng giá ngay khi được công bố.'),
          ],
        },
      },
      footer,
    ],
  },
  {
    id: 'nha-hang-thuc-don',
    version: 1,
    updatedOn: UPDATED_ON,
    name: 'Thực đơn mới & đặt bàn',
    description: 'Món mới theo mùa, combo, cảm nhận thực khách và nút gọi đặt bàn.',
    details:
      'Cho nhà hàng, quán cà phê giới thiệu thực đơn mới: món nổi bật theo mùa, combo cho nhóm, cảm nhận của thực khách và nút gọi hoặc nhắn Zalo để đặt bàn.',
    goal: 'product',
    industry: 'food_beverage',
    style: 'calm',
    sections: [
      navbar('Đặt bàn', 'Thanh điều hướng · nút đặt bàn'),
      {
        type: 'hero',
        variant: 'split',
        label: 'Hero · món mới theo mùa',
        sample: {
          eyebrow: 'Thực đơn mùa mới',
          heading: 'Món mới mỗi mùa, nấu từ nguyên liệu trong ngày',
          subheading: 'Một hai câu về phong cách bếp, món đặc trưng và không gian của quán.',
          primaryCta: cta('Đặt bàn ngay'),
        },
      },
      {
        type: 'benefits',
        variant: 'alternate',
        label: 'Món nổi bật',
        sample: {
          heading: 'Món nổi bật mùa này',
          items: [
            benefit('leaf', 'Tên món thứ nhất', 'Nguyên liệu, cách chế biến và giá của món.'),
            benefit('leaf', 'Tên món thứ hai', 'Nguyên liệu, cách chế biến và giá của món.'),
          ],
        },
      },
      {
        type: 'benefits',
        variant: 'grid',
        label: 'Combo cho nhóm',
        sample: {
          heading: 'Combo cho nhóm',
          items: [
            benefit('heart', 'Combo 2 người', 'Gồm những món gì và giá của combo.'),
            benefit('smile', 'Combo gia đình', 'Cho 4–6 người: gồm những món gì và giá combo.'),
            benefit('star', 'Combo tiệc', 'Cho nhóm đông: đặt trước bao lâu và giá combo.'),
          ],
        },
      },
      {
        type: 'testimonials',
        variant: 'cards',
        label: 'Cảm nhận thực khách',
        sample: {
          heading: 'Thực khách nói gì',
          items: [
            testimonial(
              'Món ăn vừa miệng, phục vụ nhanh dù quán đông.',
              'Tên thực khách',
              'Khách quen của quán',
            ),
            testimonial(
              'Không gian đẹp, hợp đi cùng gia đình vào cuối tuần.',
              'Tên thực khách',
              'Đi cùng gia đình',
            ),
            testimonial('Combo nhóm nhiều món, giá hợp lý.', 'Tên thực khách', 'Tiệc sinh nhật'),
          ],
        },
      },
      {
        type: 'quick_contact',
        variant: 'buttons',
        label: 'Gọi / Zalo đặt bàn',
        sample: {
          heading: 'Đặt bàn trước để có chỗ đẹp',
          text: 'Gọi hoặc nhắn Zalo, quán xác nhận bàn cho bạn ngay.',
          call: { label: 'Gọi đặt bàn', link: { kind: 'phone', phone: '' } },
          zalo: { label: 'Nhắn Zalo', link: { kind: 'zalo', phone: '' } },
        },
      },
      footer,
    ],
  },
  {
    id: 'nha-hang-khai-truong',
    version: 1,
    updatedOn: UPDATED_ON,
    name: 'Danh sách chờ ngày khai trương',
    description: 'Ngày khai trương, ưu đãi cho khách đăng ký sớm và form nhận thư mời.',
    details:
      'Cho quán sắp khai trương: báo ngày mở cửa, ưu đãi dành cho khách đăng ký trước, vài câu hỏi thường gặp và form để lại email nhận thư mời.',
    goal: 'waitlist',
    industry: 'food_beverage',
    style: 'bold',
    sections: [
      navbar('Đăng ký', 'Thanh điều hướng · nút đăng ký'),
      {
        type: 'hero',
        variant: 'centered',
        label: 'Hero · ngày khai trương',
        sample: {
          eyebrow: 'Khai trương ngày …',
          heading: 'Tên quán và món đặc trưng bạn muốn khách nhớ',
          subheading:
            'Một câu về phong cách quán và ưu đãi dành cho khách đến trong tuần khai trương.',
          primaryCta: cta('Nhận thư mời'),
        },
      },
      {
        type: 'benefits',
        variant: 'grid',
        label: 'Ưu đãi khi đăng ký sớm',
        sample: {
          heading: 'Đăng ký sớm để nhận',
          items: [
            benefit('star', 'Món tặng kèm', 'Một món tặng cho bàn đặt trong tuần khai trương.'),
            benefit('heart', 'Giảm giá hóa đơn', 'Mức giảm cho khách trong danh sách chờ.'),
            benefit('clock', 'Giữ bàn trước', 'Ưu tiên giữ bàn vào giờ cao điểm.'),
          ],
        },
      },
      {
        type: 'lead_form',
        variant: 'stacked',
        label: 'Form nhận thư mời',
        sample: {
          heading: 'Nhận thư mời ngày khai trương',
          description:
            'Để lại email và số điện thoại, quán gửi thư mời và ưu đãi trước ngày mở cửa.',
          showEmail: true,
          submitLabel: 'Nhận thư mời',
          successTitle: 'Bạn đã có tên trong danh sách khách mời',
          successMessage: 'Quán sẽ gửi thư mời cho bạn trước ngày khai trương.',
        },
      },
      {
        type: 'faq',
        variant: 'accordion',
        label: 'Câu hỏi thường gặp',
        sample: {
          items: [
            faq('Quán ở đâu?', 'Ghi địa chỉ của quán và chỗ gửi xe.'),
            faq('Có cần đặt bàn trước không?', 'Nêu việc đặt bàn trước trong tuần khai trương.'),
          ],
        },
      },
      footer,
    ],
  },
  {
    id: 'phong-tap-khai-truong',
    version: 1,
    updatedOn: UPDATED_ON,
    name: 'Ưu đãi khai trương phòng tập',
    description: 'Ưu đãi khai trương, lớp học, huấn luyện viên và form giữ chỗ.',
    details:
      'Cho phòng tập mới mở hay chi nhánh mới: ưu đãi thẻ tập có thời hạn, các lớp nổi bật, huấn luyện viên, cảm nhận hội viên và form giữ chỗ trước khi hết suất.',
    goal: 'promo',
    industry: 'fitness',
    style: 'bold',
    sections: [
      navbar('Giữ chỗ', 'Thanh điều hướng · nút giữ chỗ'),
      {
        type: 'hero',
        variant: 'split',
        label: 'Hero · ưu đãi khai trương',
        sample: {
          eyebrow: 'Khai trương · Ưu đãi đến hết ngày …',
          heading: 'Tập miễn phí 7 ngày và giảm 50% thẻ tập năm',
          subheading: 'Nói rõ ưu đãi gồm những gì, áp dụng cho ai và còn bao nhiêu suất.',
          primaryCta: cta('Giữ chỗ ngay'),
        },
      },
      {
        type: 'benefits',
        variant: 'grid',
        label: 'Các lớp nổi bật',
        sample: {
          heading: 'Lớp học nổi bật',
          items: [
            benefit('sparkles', 'Yoga', 'Lớp sáng và tối, hợp người mới bắt đầu.'),
            benefit('heart', 'Cardio', 'Đốt mỡ nhanh với bài tập theo nhạc.'),
            benefit('shield', 'Tập tạ', 'Có huấn luyện viên hướng dẫn kỹ thuật.'),
          ],
        },
      },
      {
        type: 'benefits',
        variant: 'alternate',
        label: 'Huấn luyện viên',
        sample: {
          heading: 'Huấn luyện viên',
          items: [
            benefit('star', 'Tên huấn luyện viên', 'Chứng chỉ, chuyên môn và số năm kinh nghiệm.'),
            benefit(
              'star',
              'Tên huấn luyện viên thứ hai',
              'Chứng chỉ, chuyên môn và số năm kinh nghiệm.',
            ),
          ],
        },
      },
      {
        type: 'testimonials',
        variant: 'cards',
        label: 'Cảm nhận hội viên',
        sample: {
          heading: 'Hội viên nói gì',
          items: [
            testimonial(
              'Giảm 5 kg sau 3 tháng nhờ lịch tập rõ ràng.',
              'Tên hội viên',
              'Hội viên 6 tháng',
            ),
            testimonial(
              'Phòng tập rộng, máy mới và luôn sạch sẽ.',
              'Tên hội viên',
              'Hội viên 1 năm',
            ),
            testimonial(
              'Huấn luyện viên theo sát và chỉnh tư thế rất kỹ.',
              'Tên hội viên',
              'Hội viên mới',
            ),
          ],
        },
      },
      {
        type: 'lead_form',
        variant: 'stacked',
        label: 'Form giữ chỗ',
        sample: {
          heading: 'Giữ chỗ ưu đãi khai trương',
          description: 'Số suất có hạn. Để lại tên và số điện thoại để phòng tập giữ suất cho bạn.',
          submitLabel: 'Giữ chỗ',
          successTitle: 'Đã giữ chỗ cho bạn',
          successMessage: 'Phòng tập sẽ gọi lại để hẹn buổi tập đầu tiên.',
        },
      },
      footer,
    ],
  },
  {
    id: 'phong-tap-ca-nhan',
    version: 1,
    updatedOn: UPDATED_ON,
    name: 'Gói tập cá nhân với huấn luyện viên',
    description: 'Lợi ích tập 1 kèm 1, quy trình 3 bước, trước & sau và nút gọi, nhắn Zalo.',
    details:
      'Cho huấn luyện viên hay phòng tập bán gói tập cá nhân: lợi ích của tập 1 kèm 1, quy trình bắt đầu, kết quả trước và sau, câu hỏi thường gặp và nút liên hệ nhanh.',
    goal: 'product',
    industry: 'fitness',
    style: 'minimal',
    sections: [
      navbar('Liên hệ', 'Thanh điều hướng · nút liên hệ'),
      {
        type: 'hero',
        variant: 'split',
        label: 'Hero · lộ trình riêng',
        sample: {
          eyebrow: 'Tập 1 kèm 1',
          heading: 'Lộ trình tập riêng cho mục tiêu của bạn',
          subheading:
            'Một hai câu về cách huấn luyện viên lên bài tập, chế độ ăn và theo dõi tiến độ.',
          primaryCta: cta('Nhận tư vấn'),
        },
      },
      {
        type: 'benefits',
        variant: 'grid',
        label: 'Lợi ích của tập cá nhân',
        sample: {
          heading: 'Vì sao nên tập cá nhân',
          items: [
            benefit('check', 'Bài tập riêng', 'Lịch tập theo thể trạng và mục tiêu của bạn.'),
            benefit('clock', 'Giờ tập linh hoạt', 'Chọn giờ phù hợp với lịch của bạn.'),
            benefit('heart', 'Theo dõi sát', 'Đo chỉ số và điều chỉnh bài tập mỗi tuần.'),
          ],
        },
      },
      {
        type: 'benefits',
        variant: 'steps',
        label: 'Quy trình 3 bước',
        sample: {
          heading: 'Bắt đầu chỉ với 3 bước',
          items: [
            benefit('check', 'Đo chỉ số', 'Kiểm tra thể trạng và trao đổi mục tiêu.'),
            benefit('check', 'Lên lộ trình', 'Huấn luyện viên lập lịch tập và chế độ ăn.'),
            benefit('check', 'Tập và theo dõi', 'Tập theo lịch, đánh giá kết quả mỗi tháng.'),
          ],
        },
      },
      {
        type: 'before_after',
        variant: 'side_by_side',
        label: 'Trước & sau',
        sample: {
          heading: 'Kết quả của học viên',
          beforeCaption: 'Tháng đầu tiên',
          afterCaption: 'Sau 3 tháng',
          note: 'Kết quả có thể khác nhau tùy từng người.',
        },
      },
      {
        type: 'faq',
        variant: 'accordion',
        label: 'Câu hỏi thường gặp',
        sample: {
          items: [
            faq('Một buổi tập kéo dài bao lâu?', 'Nêu thời lượng một buổi và số buổi mỗi tuần.'),
            faq(
              'Tôi chưa tập bao giờ có theo được không?',
              'Giải thích cách huấn luyện viên điều chỉnh bài tập cho người mới.',
            ),
            faq('Giá gói tập thế nào?', 'Nêu giá theo số buổi hoặc theo tháng.'),
          ],
        },
      },
      {
        type: 'quick_contact',
        variant: 'buttons',
        label: 'Gọi / Zalo nhanh',
        sample: {
          heading: 'Nhận tư vấn miễn phí',
          text: 'Gọi hoặc nhắn Zalo để hẹn buổi đo chỉ số đầu tiên.',
          call: { label: 'Gọi tư vấn', link: { kind: 'phone', phone: '' } },
          zalo: { label: 'Nhắn Zalo', link: { kind: 'zalo', phone: '' } },
        },
      },
      footer,
    ],
  },
];

export function findSystemTemplate(id: string): SystemTemplate | undefined {
  return systemTemplates.find((template) => template.id === id);
}

/**
 * Where the page's buttons lead: its lead form, or else its call and Zalo buttons, the way the
 * goal blueprints send the Hero button to the form (ADR-016).
 */
const CONTACT_TYPES: readonly SectionType[] = ['lead_form', 'quick_contact'];

/** Content paths of the buttons that lead to the contact section. */
const CONTACT_BUTTON_PATHS: Partial<Record<SectionType, string>> = {
  navbar: 'cta.link',
  hero: 'primaryCta.link',
};

export function templateHasForm(template: Pick<SystemTemplate, 'sections'>): boolean {
  return template.sections.some((section) => section.type === 'lead_form');
}

/** The style's color scheme of each section, in page order. */
function schemesOf(template: Pick<SystemTemplate, 'sections' | 'style'>) {
  return pageStyleSchemes(
    template.style,
    template.sections.map((section) => section.type),
  );
}

/** The outline of board 18 and what the thumbnail of board 17 draws. */
export function templateSections(
  template: Pick<SystemTemplate, 'sections' | 'style'>,
): TemplateSection[] {
  const schemes = schemesOf(template);
  return template.sections.map((section, index) => ({
    type: section.type,
    variant: section.variant,
    colorScheme: schemes[index] ?? 'light',
    label: section.label,
  }));
}

/**
 * The draft a template starts: its sections with fresh ids from `newId`, its sample copy, every
 * text marked as sample, and the navigation and Hero buttons leading to the contact section.
 * The caller parses it with the registry before storing it, as for every composition.
 */
export function buildCompositionFromTemplate(
  template: Pick<SystemTemplate, 'sections' | 'style'>,
  newId: () => string,
): Composition {
  const schemes = schemesOf(template);
  // Ids first, in page order, so the buttons can lead to a section placed after them.
  const ids = template.sections.map(() => newId());
  const contactType = CONTACT_TYPES.find((type) =>
    template.sections.some((section) => section.type === type),
  );
  const contactIndex = template.sections.findIndex((section) => section.type === contactType);
  const contactId = contactIndex === -1 ? null : (ids[contactIndex] ?? null);
  return {
    version: 1,
    sections: template.sections.map((entry, index): SectionInstance => {
      const id = ids[index];
      if (id === undefined) {
        throw new Error(`No section id for position ${index}`);
      }
      const instance = createSectionInstance(entry.type, entry.variant, id);
      let content: Record<string, unknown> = { ...instance.content, ...entry.sample };
      const buttonPath = CONTACT_BUTTON_PATHS[entry.type];
      if (contactId !== null && buttonPath !== undefined) {
        content = setAtPath(content, buttonPath, { kind: 'section', sectionId: contactId });
      }
      return {
        ...instance,
        colorScheme: schemes[index] ?? instance.colorScheme,
        content,
        samplePaths: samplePathsOf({ type: entry.type, variant: entry.variant, content }),
      };
    }),
  };
}
