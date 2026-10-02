# Local walkthrough assets

`walkthrough.css`, `widgets.js` and `walkthrough_template.html` were copied from
the existing local Claude skill `~/.claude/skills/fpga-hls-walkthrough/assets`.
`assemble.py` adapts its `scripts/make_walkthrough.py` for this project's build.
The original source comments are retained. No separate license file or license
notice was present in that local skill; this copy does not assert a new license.

These assets preserve the existing page's theme, layout and widget behavior.
The skill's unused `fixedpoint.js` helper is not included: this page implements
its integer arithmetic in `kernel_model.js` and has no `FX` dependency.

Build from the repository root:

```powershell
python .\walkthrough\build_page.py
```

The build resolves every source/data/output path relative to `build_page.py`.
It also works when called by absolute path from another working directory and
does not read from `.claude` or the original project checkout. The output embeds
the JSON and JavaScript, so the model and animations work from `file://`.
The optional Google Fonts stylesheet in the inherited template may use the
network; local font fallbacks keep the page usable offline.
