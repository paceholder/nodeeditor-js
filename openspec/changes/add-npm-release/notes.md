# Notes

## CI (3.1)

Browser tests are left out of CI: vitest browser mode launches the installed Google Chrome
(`channel: "chrome"` in `vitest.config.ts`), and running it on ubuntu-latest has not been
verified. The consumer smoke job runs on Node 22 only and needs no git identity (the script
sets one for its temporary repository). The workflow cannot be executed locally; only its YAML
syntax was checked.
