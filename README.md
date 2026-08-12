# BIO 2230 Practical Prep

Static study tools for BIO 2230 practical preparation.

The Lower Limb site uses a dependency-free learning coach that keeps coverage,
adaptive review scheduling, readiness, and attempt history in the student's
browser. Students can export and import a JSON progress backup from the site.

Published site structure:

- `index.html` - course menu
- `lower-limb/` - Practical 1: Lower Limb
- `upper-limb/` - Practical 2: Upper Limb
- `axial/` - Practical 3: Axial

GitHub Pages publishes the repository root from `main` at
<https://tmbeckermann.github.io/2230_DrB_Practical_Prep/>. The site uses
relative links and includes `.nojekyll`, so the same source works beneath the
repository subpath without a separate base-path rewrite.

The Lower Limb site is generated from the course workspace with `build_student_site.py`.

Muscle model-ID image banks use explicit source metadata:

- `pal-atlas-substitute` means highlighted PAL atlas art used for model-ID practice. It is not a Belmont lab-model photo.
- `course-practical-image` means an existing course image. Multi-label reference images are excluded from single-answer simulations.
- `course-model-reference` means an existing multi-label course view of the single-leg model. It remains reference-only.
- `lab-model-photo` is reserved for an explicitly verified photograph of a physical lab model.

Assessment-context metadata keeps the visual practice aligned with the course setup:

- Lower limb targets the single-leg teaching model.
- Upper limb targets the arm model. Trapezius, subclavius, pectoralis minor, pectoralis major, and latissimus dorsi are explicit torso fallbacks because they are not present on the arm model.
- Axial facial and mastication muscles use image identification only. Other axial muscles use torso-focused PAL substitutes because they are absent from the tested limb models.

All three practical sites expose the same 16-activity review pattern. `activity-links.html` provides direct links to every exact activity and drill mode.

Mixed Practical Mode checks sample evenly across the selected question types, so muscles with several atlas views do not receive extra weight.

Cloudflare Workers Builds should use:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Version command: `npx wrangler versions upload`

Wrangler publishes only `dist/client`; the Worker maps that output to
`/DrB-practicals/` and redirects the domain root there.

The public GitHub repository intentionally omits `.openai/hosting.json`, which
belongs to the separate ChatGPT Sites project. The static build includes that
metadata only when it is present locally.

Development checks:

- `npm test` - learning-engine, model-image provenance, and Cloudflare Worker tests
- `npm run test:smoke` - desktop, tablet, mobile, and direct-file browser checks
- `npx wrangler deploy --dry-run` - Cloudflare Worker and asset packaging check
