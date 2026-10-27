# UTme! print specifications (research notes, October 2026)

## Print areas (official)

Source: UTme! FAQ "インクジェットプリントの大きさ(範囲)はどれくらいですか。",
<https://utme.uniqlo.com/faq/print/>, table image `印刷範囲表25.4-2.png` (April 2025).
All values in mm. *Collar* = distance from the lowest point of the front neck
seam to the top of the print area; for bags it is measured from the top edge.

| Item | Size | Width | Height | Collar / top |
|---|---|---|---|---|
| Basic T | XS | 270 | 308 | 40 |
| | S | 290 | 331 | 40 |
| | M | 310 | 354 | 40 |
| | L / XL | 330 | 373 | 40 |
| | XXL | 350 | 400 | 50 |
| U Crew Neck T | S | 290 | 331 | 70 |
| | M | 310 | 354 | 70 |
| | L / XL | 330 | 373 | 70 |
| | XXL | 350 | 400 | 70 |
| AIRism Cotton Oversized T | S | 290 | 331 | 40 |
| | M | 310 | 354 | 40 |
| | L / XL | 330 | 373 | 40 |
| | XXL | 350 | 400 | 50 |
| Kids Basic T | 100 | 213 | 240 | 32 |
| | 110–140 | 235 | 265 | 32 (110–120) / 36 (130–140) |
| | 150 | 265 | 299 | 36 |
| | 160 | 270 | 308 | 40 |
| Sweatshirt | S | 290 | 331 | 90 |
| | M | 310 | 354 | 90 |
| | L | 330 | 373 | 90 |
| | XL / XXL | 350 | 400 | 90 |
| Sweat pullover hoodie* | S | 199 | 224 | 40 |
| | M | 213 | 240 | 40 |
| | L | 224 | 252 | 40 |
| | XL | 240 | 271 | 40 |
| | XXL | 251 | 283 | 50 |
| Tote bag | F | 265 | 298 | 60 from top |
| Mini tote bag | F | 125 | 140 | 40 from top |

\* Listed in the print-area table but not in the current UTme! line-up, so it is not offered in the app.

## Upload rules (official)

Source: <https://utme.uniqlo.com/faq/processing/>

- PNG or JPEG only; recommended ≤ 2048 × 2304 px, RGB.
- ≈ 10 MB (app) / ≈ 5 MB (web).
- The printer resolves 96 dpi.
- Pure white `#FFFFFF` is **not printed** (treated as transparent); designs that are
  white-only on WHITE items are cancelled. Use transparent PNGs for cut-outs.
- The image is placed in the centre of the print area initially; front printing only.

Other regions: the Philippines FAQ documents 2048 × 2048 px, transparent PNG,
≤ 2 MB, 96 dpi. Germany offers UTme! in Berlin (Tauentzienstraße), Köln (Hohe
Straße), Hamburg (Alter Wall) and Frankfurt (Biebergasse); EU FAQs (e.g. Sweden)
list adult T, kids T, tote and mini tote, front only, without file specs.

## Availability in Germany

Source: uniqlo.com/de UTme! page, section "Preise & Verfügbarkeit" (Berlin
Tauentzienstraße, Köln Hohe Straße, Hamburg Alter Wall, Frankfurt Biebergasse).

| Item | Price | Colour | Sizes |
|---|---|---|---|
| T-Shirt (Erwachsene) | 19,90 € | Weiß | XXS – 3XL |
| T-Shirt (Kinder) | 12,90 € | Weiß | 110 – 160 |
| Tragetasche | 24,90 € | Off White | Onesize |
| Mini Tragetasche | 19,90 € | Off White | Onesize |

XXS and 3XL are not in the Japanese print-area table. The app uses the XS
area (270 × 308 mm) for XXS and the XXL area (350 × 400 mm) for 3XL, marks
them as estimates (≈) and asks users to check in store. German stores do not
document upload limits, so the app defaults to the stricter 2048 × 2048 px /
2 MB export there.

## Garments (official, cm)

Source: <https://utme.uniqlo.com/itemlineup/>

| Item | Sizes | Colours | Length (身丈) | Shoulder (肩幅) | Body width (身幅) |
|---|---|---|---|---|---|
| Basic T | XS–XXL | White, Black | 63–76.5 | 42–50.5 | 46–63 |
| U Crew Neck T | S–XXL | White | 66–77 | 45–52 | 50–64 |
| AIRism Cotton Oversized T (5-length sleeve) | S–XXL | White | 66–77.5 | 51–58 | 52.5–66.5 |
| Kids Basic T | 100–160 | White | 42–63 | 33–42.5 | 34–47 |
| Sweatshirt | S–XXL | Off White, Black | 62–73 | 47.5–54.5 | 53.5–67.5 |
| Tote bag | F | Off White | 41 high × 39 wide (size page: 41.5 × 38), base 14.5 × 28.5, handles 53 | | |
| Mini tote bag | F | Off White | 21.5 high × 35 wide (size page: 32.5), base 9 × 26, handles 40 | | |

Per-size values are in `src/products.ts`.
