/** Bỏ dấu tiếng Việt + hạ chữ thường để tìm kiếm không phân biệt hoa/thường và dấu. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Escape ký tự đặc biệt của LIKE/ILIKE. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}
