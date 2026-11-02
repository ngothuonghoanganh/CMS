import {
  AiError,
  AiTextModel,
  type AiTextRequest,
  type AiTextResult,
  type JsonSchema,
} from '../ai-text-model.js';

/** A request the fake received, without its signal. */
export type RecordedAiRequest = Omit<AiTextRequest, 'signal'>;

/**
 * A test's own answer to a request: a result, an error to throw, or undefined to answer as the
 * fake does. It may wait on `signal`, like a slow service.
 */
export type FakeAiHandler = (
  request: RecordedAiRequest,
  signal: AbortSignal,
) => Promise<AiTextResult | undefined> | AiTextResult | undefined;

/** Requests kept for tests; an E2E run sends many more, which need not stay in memory. */
const MAX_RECORDED = 200;

/** Fixed Vietnamese copy by section type and field, what a writer would plausibly propose. */
const COPY: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  navbar: { cta: 'Đặt lịch ngay' },
  hero: {
    eyebrow: 'Tư vấn miễn phí',
    // A figure, which the fake marks for review like a real writer should (ADR-031).
    subheading:
      'Đăng ký hôm nay để được tư vấn riêng, ưu đãi 20% cho 50 khách hàng đầu tiên trong tháng.',
    primaryCta: 'Nhận tư vấn miễn phí',
    secondaryCta: 'Xem chi tiết',
  },
  benefits: {
    heading: 'Vì sao khách hàng chọn chúng tôi',
    intro: 'Những điều bạn nhận được ngay từ buổi gặp đầu tiên.',
  },
  testimonials: { heading: 'Khách hàng nói gì về chúng tôi' },
  logos: { heading: 'Đối tác đồng hành cùng chúng tôi' },
  before_after: {
    heading: 'Kết quả sau liệu trình',
    note: 'Kết quả có thể khác nhau tùy từng người.',
  },
  faq: { heading: 'Câu hỏi thường gặp' },
  lead_form: {
    heading: 'Đăng ký nhận tư vấn',
    description: 'Để lại họ tên và số điện thoại, chúng tôi gọi lại cho bạn trong giờ làm việc.',
    submitLabel: 'Gửi đăng ký',
    successTitle: 'Cảm ơn bạn đã đăng ký',
    successMessage: 'Chúng tôi sẽ liên hệ với bạn sớm nhất có thể.',
  },
  quick_contact: {
    heading: 'Cần tư vấn nhanh?',
    text: 'Gọi điện hoặc nhắn Zalo, chúng tôi trả lời ngay trong giờ làm việc.',
    call: 'Gọi ngay',
    zalo: 'Nhắn Zalo',
  },
  cta_band: {
    heading: 'Sẵn sàng bắt đầu cùng chúng tôi?',
    text: 'Để lại thông tin, chúng tôi liên hệ để tư vấn lộ trình phù hợp với bạn.',
    cta: 'Đăng ký tư vấn',
  },
};

/** List items by section type and list, in order. */
const ITEMS: Readonly<Record<string, readonly Readonly<Record<string, string>>[]>> = {
  benefits: [
    { title: 'Tư vấn tận tâm', description: 'Chuyên viên lắng nghe và tư vấn đúng nhu cầu.' },
    { title: 'Quy trình rõ ràng', description: 'Bạn biết trước từng bước và thời gian.' },
    { title: 'Đồng hành lâu dài', description: 'Chúng tôi theo dõi và hỗ trợ sau dịch vụ.' },
    { title: 'Chi phí minh bạch', description: 'Báo giá rõ ràng trước khi bắt đầu.' },
    { title: 'Lịch hẹn linh hoạt', description: 'Chọn thời gian phù hợp với bạn.' },
    { title: 'Không gian thoải mái', description: 'Nơi bạn thấy yên tâm khi đến.' },
  ],
  faq: [
    {
      question: 'Buổi tư vấn đầu tiên gồm những gì?',
      answer: 'Chúng tôi tìm hiểu nhu cầu của bạn và đề xuất lộ trình phù hợp.',
    },
    {
      question: 'Tôi cần chuẩn bị gì trước khi đến?',
      answer: 'Bạn chỉ cần đặt lịch trước, mọi thứ còn lại chúng tôi sẽ hướng dẫn.',
    },
    {
      question: 'Có thể đổi lịch hẹn không?',
      answer: 'Có, bạn báo trước để chúng tôi sắp xếp thời gian khác.',
    },
  ],
};

function capped(text: string, schema: JsonSchema): string {
  return schema.type === 'string' && schema.maxLength !== undefined
    ? text.slice(0, schema.maxLength).trimEnd()
    : text;
}

/** A line of the prompt, e.g. "- Product or service: …". */
function promptLine(prompt: string, label: string): string | null {
  const line = prompt
    .split('\n')
    .find((candidate) => candidate.replace(/^- /, '').startsWith(`${label}: `));
  return line === undefined
    ? null
    : line
        .replace(/^- /, '')
        .slice(label.length + 2)
        .trim();
}

/** The fixed answer to a section's schema: every field filled, lists at their fewest items. */
function fakeCopy(schema: JsonSchema, prompt: string): Record<string, unknown> {
  const type = promptLine(prompt, 'Section type') ?? '';
  const product = promptLine(prompt, 'Product or service');
  const copy: Record<string, unknown> = {};
  if (schema.type !== 'object') {
    return copy;
  }
  for (const [key, property] of Object.entries(schema.properties)) {
    if (key === 'review') {
      copy[key] = type === 'hero' && 'subheading' in schema.properties ? ['subheading'] : [];
    } else if (property.type === 'string') {
      const text =
        type === 'hero' && key === 'heading' && product !== null
          ? product
          : (COPY[type]?.[key] ?? `${property.description ?? key} mới`);
      copy[key] = capped(text, property);
    } else if (property.type === 'array' && property.items.type === 'object') {
      const items = ITEMS[type] ?? [];
      const count = Math.max(property.minItems ?? 1, Math.min(3, property.maxItems ?? 3));
      const fields = property.items.properties;
      copy[key] = Array.from({ length: count }, (_unused, index) =>
        Object.fromEntries(
          Object.entries(fields).map(([field, fieldSchema]) => [
            field,
            capped(
              items[index]?.[field] ?? `${fieldSchema.description ?? field} ${index + 1}`,
              fieldSchema,
            ),
          ]),
        ),
      );
    }
  }
  return copy;
}

/**
 * The AI of tests and E2E (`AI_PROVIDER=fake`, refused in production): fixed, plausible
 * Vietnamese copy that matches the request's schema, at once. It records what it was asked, so a
 * test can check what a prompt holds, and a test can answer in its place (`respondWith`).
 */
export class FakeAiTextModel extends AiTextModel {
  readonly requests: RecordedAiRequest[] = [];
  private handler: FakeAiHandler | null = null;

  /** Answers with `handler` from now on; null goes back to the fixed copy. */
  respondWith(handler: FakeAiHandler | null): void {
    this.handler = handler;
  }

  reset(): void {
    this.requests.length = 0;
    this.handler = null;
  }

  async generate(request: AiTextRequest): Promise<AiTextResult> {
    const { signal, ...recorded } = request;
    this.requests.push(recorded);
    if (this.requests.length > MAX_RECORDED) {
      this.requests.shift();
    }
    if (signal.aborted) {
      throw new AiError('aborted', 'The AI request was cancelled');
    }
    const answer = await this.handler?.(recorded, signal);
    if (answer !== undefined) {
      return answer;
    }
    const text = JSON.stringify(fakeCopy(request.schema.schema, request.prompt));
    return {
      text,
      usage: { inputTokens: request.prompt.length, outputTokens: text.length },
      truncated: false,
    };
  }
}
