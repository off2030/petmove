import type { CaseRow } from "./types";

/** 동물 케이스의 선택 공동 보호자. 로그인 계정·고객 대표 이름과 분리한다. */
export interface CoOwnerName {
  name_ko: string;
  first_name_en: string;
  last_name_en: string;
}
export function normalizeCoOwner(value: unknown): CoOwnerName | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error("공동 보호자 이름을 확인해 주세요.");
  const obj = value as Record<string, unknown>;
  function name(key: string) {
    const v = obj[key] ?? "";
    if (typeof v !== "string" || v.length > 120)
      throw new Error("이름은 각 120자 이내로 입력해 주세요.");
    return v.trim();
  }
  const result = {
    name_ko: name("name_ko"),
    first_name_en: name("first_name_en"),
    last_name_en: name("last_name_en"),
  };
  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(result.first_name_en + result.last_name_en))
    throw new Error("영문 이름과 성에는 영문을 입력해 주세요.");
  return Object.values(result).some(Boolean) ? result : null;
}
export function readCoOwner(
  data: Record<string, unknown> | null | undefined,
): CoOwnerName | null {
  try {
    return normalizeCoOwner(data?.co_owner);
  } catch {
    return null;
  }
}
export function coOwnerEnglishName(owner: CoOwnerName): string {
  return (
    [owner.first_name_en, owner.last_name_en].filter(Boolean).join(" ") ||
    owner.name_ko
  );
}
/** 서류용 전체 이름만 병기한다. 성/이름 분리·신청자·결제자 필드는 기존 1인 값을 쓴다. */
export function documentOwnerNames(
  row: Pick<CaseRow, "customer_name" | "customer_name_en">,
  data: Record<string, unknown>,
  language: "ko" | "en" = "en",
): string {
  const first =
    typeof data.customer_first_name_en === "string"
      ? data.customer_first_name_en.trim()
      : "";
  const last =
    typeof data.customer_last_name_en === "string"
      ? data.customer_last_name_en.trim()
      : "";
  const primary =
    language === "ko"
      ? (row.customer_name ?? "").trim()
      : [first, last].filter(Boolean).join(" ") ||
        row.customer_name_en?.trim() ||
        (row.customer_name ?? "").trim();
  const owner = readCoOwner(data);
  const extra = owner
    ? language === "ko"
      ? owner.name_ko || coOwnerEnglishName(owner)
      : coOwnerEnglishName(owner)
    : "";
  const names = [primary, extra].filter(Boolean);
  return names
    .filter(
      (name, index) =>
        names.findIndex(
          (existing) =>
            existing.toLocaleLowerCase() === name.toLocaleLowerCase(),
        ) === index,
    )
    .join(" / ");
}
