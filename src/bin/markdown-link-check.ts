import chalk from 'chalk'
import fs from 'fs'
import program from 'commander'
import { Options, processInputs, ProcessInputsResults, ProcessInputResults, InputsArgs, Status } from '../'

const statusLabels: { [status: string]: string } = {
    alive: chalk.green('✓'),
    dead: chalk.red('✖'),
    ignored: chalk.gray('/'),
    error: chalk.yellow('⚠'),
}

export interface CmdOptions {
    config?: string
    quiet?: boolean
    verbose?: boolean
    debug?: boolean
    stats?: boolean
    retryOnError?: boolean
    retryOn429?: boolean
    timeout?: string
    fileEncoding?: string
    inputs?: string[]
}

// tslint:disable:no-console
function run(filenameOrUrl: string, cmdObj: CmdOptions): void {
    const inputs = cmdObj.inputs || [filenameOrUrl]
    const options = getOptions(cmdObj)
    overrideOptionswithCmdObj(options, cmdObj)
    const inputsArgs: InputsArgs = {
        inputs: inputs.map((input) => {
            return { filenameOrUrl: input }
        }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    processInputs(inputsArgs, options, (err: any, processInputsResults?: ProcessInputsResults) => {
        printInputsResult(cmdObj, err, processInputsResults)
    })
}

function getOptions(cmdObj: CmdOptions): Options {
    let options: Options
    if (cmdObj.config) {
        let configContent
        try {
            configContent = fs.readFileSync(cmdObj.config)
        } catch (err) {
            console.error(chalk.red('ERROR: Error reading config file'), '. Error:', err)
            process.exit(1)
        }
        options = JSON.parse(configContent.toString())
        if (typeof options !== 'object') {
            console.error(chalk.red(`ERROR: Config is not a valid JSON Object: ${options}`))
            process.exit(1)
        }
    } else {
        options = {}
    }
    return options
}

function overrideOptionswithCmdObj(options: Options, cmdObj: CmdOptions) {
    if (cmdObj.debug) {
        options.debug = cmdObj.debug
    }
    if (cmdObj.retryOn429) {
        options.retryOn429 = cmdObj.retryOn429
    }
    if (cmdObj.retryOnError) {
        options.retryOnError = cmdObj.retryOnError
    }
    if (cmdObj.timeout) {
        options.timeout = cmdObj.timeout
    }
    if (cmdObj.fileEncoding) {
        options.fileEncoding = cmdObj.fileEncoding
    }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function printInputsResult(cmdObj: CmdOptions, err: any, processInputsResults?: ProcessInputsResults): void {
    if (err) {
        console.error(chalk.red('ERROR: something went wrong!'))
        console.error(err)
        process.exit(1)
    }

    if (!processInputsResults) {
        console.error(chalk.red('ERROR: No processInputsResults! (should not happen)'))
        process.exit(1)
    }
    const results = processInputsResults.results
    if (!results || results.length === 0) {
        console.error(chalk.red('ERROR: No input processed! (should not happen)'))
        process.exit(1)
    }

    const inputCount = results.length

    for (const result of results) {
        if (!result) {
            if (!cmdObj.quiet) {
                console.log(chalk.yellow('Warning: no detail! (should not happen)'))
            }
        } else {
            printInputResult(cmdObj, result)
        }
    }

    // print summary
    if (cmdObj.stats) {
        console.log()
        console.log('SUMMARY:')
        console.log('--------')
        console.log('Total inputs:', inputCount)
        console.log('Total links:', processInputsResults.stats.linksCount)
        console.log('- alive   :', processInputsResults.stats.aliveLinksCount)
        console.log('- ignored :', processInputsResults.stats.ignoredLinksCount)
        console.log('- error   :', processInputsResults.stats.errorLinksCount)
        console.log('- dead    :', processInputsResults.stats.deadLinksCount)
        console.log('Cache:', processInputsResults.stats.linksCount)
        console.log('- hits   :', processInputsResults.cacheStats.cacheHits)
        console.log('- miss :', processInputsResults.cacheStats.cacheMiss)
    }
    const isFailed = processInputsResults.stats.errorLinksCount + processInputsResults.stats.deadLinksCount === 0
    process.exit(isFailed ? 0 : 1)
}

function printInputResult(cmdObj: CmdOptions, result: ProcessInputResults): void {
    console.log()
    console.log(chalk.cyan('Input: ' + result.filenameOrUrl))

    const linkResults = result.results
    let deadLinksCount = 0
    let errorLinksCount = 0

    if (!linkResults) {
        if (!cmdObj.verbose) {
            console.log(chalk.yellow('Debug: No hyperlinks found!'))
        }
        return
    }

    for (const linkResult of linkResults) {
        if (!linkResult) {
            if (!cmdObj.quiet) {
                console.log(chalk.yellow('Warning: no link detail! (should not happen)'))
            }
        } else {
            if (linkResult.status === Status.ALIVE) {
                // ignore
            } else if (linkResult.status === Status.IGNORED) {
                // ignore
            } else if (linkResult.status === Status.ERROR) {
                errorLinksCount++
            } else if (linkResult.status === Status.DEAD) {
                deadLinksCount++
            } else {
                console.log(chalk.yellow(`Warning: unknowns link status "${linkResult.status}"`))
            }

            const statusLabel = statusLabels[linkResult.status] || '?'
            // prettier-ignore

            const isOk = (linkResult.status === Status.ALIVE || linkResult.status === Status.IGNORED)
            if (cmdObj.quiet && isOk) {
                // Skip alive messages in quiet mode.
                break
            }
            console.log(
                `[${statusLabel}] ${linkResult.link}` +
                    (!isOk || cmdObj.verbose ? ` → Status: ${linkResult.statusCode}` : '') +
                    (linkResult.err ? chalk.red(` (Error: ${linkResult.err})`) : '') +
                    (linkResult.additionalMessages ? chalk.yellow(` (Warning: ${linkResult.additionalMessages})`) : ''),
            )
        }
    }

    const linksCount = linkResults.length
    console.log('%s links checked.', linksCount)
    if (deadLinksCount) {
        console.log(chalk.red('ERROR: %s dead links found!'), deadLinksCount)
    }
    if (errorLinksCount) {
        console.log(chalk.red('ERROR: %s error links found!'), errorLinksCount)
    }
}
// tslint:enable:no-console

program
    // .option('-p, --progress', 'show progress bar')
    .option('-c, --config [config]', 'apply a config file (JSON), holding e.g. url specific header configuration')
    .option('-q, --quiet', 'displays errors only')
    .option('-v, --verbose', 'displays detailed error information')
    .option('-d, --debug', 'displays debug information')
    .option('-i, --inputs <inputs...>', 'list of inputs')
    // .option('-a, --alive <code>', 'comma separated list of HTTP codes to be considered as alive', commaSeparatedCodesList)
    .option('--retryOnError', 'retry after an error')
    .option('--retryOn429', "retry after the duration indicated in 'retry-after' header when HTTP code is 429")
    .option('-e, --fileEncoding <string>', '')
    .option('-s, --stats', '')
    .option('--timeout <string>', '')
    .arguments('[filenameOrUrl]')
    .action(run)
    .parse(process.argv)
