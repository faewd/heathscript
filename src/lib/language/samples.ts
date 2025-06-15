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
  fib2: `
    ..  a:  b:
        00  01
    0a~>  
    ""  oo
          <+
    xx  @b  @a
  `,
	countdown: `
    0a
    --:>oo
    ""  xx
    xx
  `
}

const samples = Object.fromEntries(Object.entries(samplesRaw).map(([key, sample]) => [key, dedent(sample.trim())]))
export default samples
