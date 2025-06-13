import dedent from "dedent"

const samplesRaw = {
	fib: `
    >>00##01<<
    ^^oo##  ^^
    ^^  +>  ^^
    ^^  ##oo^^
    ^^  <+  ^^
    ^^<<##>>^^
    ##########
  `,
	countdown: `
    0a
    --:>oo
    ""  xx
    xx
  `
}

const samples = Object.fromEntries(
	Object.entries(samplesRaw).map(([key, sample]) => [key, dedent(sample.trim())])
)
export default samples
