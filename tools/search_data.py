from __future__ import annotations

from common import clean_row_dict, extract_terms, norm_text, parse_args, print_json, read_tables


def main() -> None:
    args = parse_args(include_question=True)
    terms = extract_terms(args.question)
    matches = []

    for table in read_tables(args.data):
        df = table.get("data")
        if df is None or df.empty:
            continue

        for idx, row in df.iterrows():
            row_text = " | ".join(norm_text(v) for v in row.values)
            hit_terms = [term for term in terms if term.lower() in row_text]
            if hit_terms:
                matches.append({
                    "file": table["file"],
                    "sheet": table["sheet"],
                    "excel_row_number": int(idx) + 2,
                    "matched_terms": hit_terms,
                    "row": clean_row_dict(row)
                })

    matches = sorted(matches, key=lambda m: len(m["matched_terms"]), reverse=True)[:25]
    print_json({
        "ok": True,
        "question": args.question,
        "terms_used": terms,
        "match_count": len(matches),
        "matches": matches
    })


if __name__ == "__main__":
    main()
