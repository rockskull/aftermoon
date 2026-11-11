import { addDays, toDateKey } from "./dates";
import { normalizeFeed } from "./normalize";

/**
 * Demo content shown until CLUB_API_URL points at the real Google Sheet.
 * Dates are relative to today so every status (OPEN, COMING SOON, CLOSED,
 * FINISHED, CANCELED) and both kinds of period bars are always visible.
 * It goes through the same normalizer as the real feed.
 */
export function buildSampleData(now: number) {
  const today = toDateKey(now);
  const day = (offset: number) => addDays(today, offset);
  const at = (offset: number, time: string) => `${day(offset)}T${time}:00+09:00`;
  const form = "https://forms.gle/your-registration-form";

  return normalizeFeed({
    events: [
      {
        event_id: "sample-new-set",
        title: "새 문제 오픈 세션",
        short_title: "새 문제 오픈",
        description:
          "벽 한 면을 새로 세팅했어요. 다 같이 처음 붙어보면서 베타를 나누는 저녁입니다.\n난이도는 V0부터 V5까지 고르게 준비했어요.",
        category: "climbing",
        start_at: at(2, "19:30"),
        end_at: at(2, "22:00"),
        registration_close: at(2, "18:00"),
        capacity: 12,
        public_fee: 0,
        registration_url: form,
        host: "세팅 팀",
        audience: "멤버 누구나",
        notes: "초크와 암벽화를 챙겨 주세요. 대여화는 사이즈가 한정되어 있어요.",
        visibility: "public",
        status: "published",
      },
      {
        event_id: "sample-beginner-clinic",
        title: "처음 오는 사람을 위한 볼더링 클리닉",
        short_title: "볼더링 클리닉",
        description: "떨어지는 법, 발 쓰는 법, 쉬는 법까지. 처음 오는 분들을 위한 두 시간짜리 기초 클리닉입니다.",
        category: "workshop",
        start_at: at(5, "19:00"),
        end_at: at(5, "21:00"),
        registration_open: at(-4, "12:00"),
        registration_close: at(3, "23:59"),
        capacity: 6,
        public_fee: 10000,
        registration_url: form,
        host: "운영진",
        audience: "볼더링이 처음이거나 다시 시작하는 분",
        notes: "편한 운동복이면 충분해요. 암벽화는 대여할 수 있어요.",
        visibility: "public",
        status: "closed",
      },
      {
        event_id: "sample-vinyl-night",
        title: "LP 들으며 쉬는 밤",
        short_title: "LP 나잇",
        description:
          "각자 좋아하는 LP를 한 장씩 가져와 돌려 듣는 밤. 클라이밍은 잠깐 쉬고, 음악 이야기를 나눠요.",
        category: "music",
        start_at: at(9, "20:00"),
        end_at: at(9, "23:00"),
        registration_open: at(3, "20:00"),
        registration_close: day(8),
        capacity: 10,
        public_fee: "5,000원 (음료 포함)",
        registration_url: form,
        host: "멤버 제안 · 지민",
        audience: "멤버와 멤버의 친구",
        notes: "LP가 없어도 괜찮아요. 듣고 싶은 곡을 알려 주시면 준비해 둘게요.",
        visibility: "public",
        status: "published",
      },
      {
        event_id: "sample-morning-session",
        title: "주말 아침 세션",
        short_title: "주말 아침",
        description: "사람 없는 오전에 천천히 몸을 푸는 세션. 끝나고 근처에서 브런치를 먹어요.",
        category: "climbing",
        start_at: at(12, "10:00"),
        end_at: at(12, "12:00"),
        registration_open: at(-1, "09:00"),
        registration_close: day(10),
        capacity: 8,
        public_fee: 0,
        registration_url: form,
        host: "운영진",
        audience: "멤버 누구나",
        visibility: "public",
        status: "published",
      },
      {
        event_id: "sample-taping",
        title: "테이핑 & 손 관리 워크숍",
        short_title: "손 관리",
        description: "손가락 테이핑과 피부 관리법을 배우는 작은 워크숍이었어요.",
        category: "workshop",
        start_at: at(16, "19:30"),
        end_at: at(16, "21:00"),
        capacity: 8,
        public_fee: 8000,
        host: "외부 강사",
        visibility: "public",
        status: "canceled",
      },
      {
        event_id: "sample-film-night",
        title: "클라이밍 영화 상영회",
        short_title: "영화 상영회",
        description: "빔프로젝터로 클라이밍 다큐멘터리를 함께 봤어요.",
        category: "film",
        start_at: at(-6, "20:00"),
        end_at: at(-6, "22:30"),
        capacity: 15,
        public_fee: 0,
        host: "멤버 제안 · 현우",
        visibility: "public",
        status: "published",
      },
      {
        // Never shown: private rows are filtered out (the real feed never sends them either).
        event_id: "sample-private",
        title: "운영진 회의",
        start_at: at(4, "21:00"),
        visibility: "private",
        status: "published",
      },
    ],
    enrollments: [
      {
        enrollment_id: "sample-enroll-now",
        title: "정기 멤버 등록",
        description: "다음 달 정기 멤버 등록 기간이에요. 기존 멤버도 갱신 신청이 필요해요.",
        start_date: day(-3),
        end_date: day(8),
        application_url: form,
        status: "published",
      },
      {
        enrollment_id: "sample-enroll-next",
        title: "신규 멤버 모집",
        description: "새 멤버를 소수 모집합니다. 자세한 조건은 모집 기간에 안내할게요.",
        start_date: day(20),
        end_date: day(27),
        status: "published",
      },
    ],
  });
}
