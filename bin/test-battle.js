#!/usr/bin/env node
const colors = require('colors')
const Engine = require('ai-battle-engine')
const opts = require('commander')
const helpers = require('../helpers')

opts
	.description('CLI to test the hero.js code locally')
	.option('-w, --wait <n>', 'Turn by turn step through of the battle', parseFloat, 500)
	.option('-t, --turns <n>', 'Specifies how many turns to run', parseFloat, 1250)
	.option('-a, --all-heroes', 'Show the moves of all heroes')
	.option('-S, --no-src', 'Run using the source version')
	.option('-h, --heroes <b>', 'Heroes per team', parseFloat, 11)
	.option('-m, --map [n]', 'Which map to use or random')
	.parse(process.argv)

// No specific map specified, print the list
if (opts.map === true) {
	console.log('balanced\nbloodDiamond\ndiamondsEverywhere\noasis\nsmiley\nsplitDownTheMiddle\ntheColosseum\ntrappedInTheMiddle')
	process.exit()
}

const engine = new Engine({ maxUsersPerTeam: opts.heroes, maxTurns: opts.turns })
const users = '.'.repeat(opts.heroes * 2).split('').map((_, i) => ({ github_login: i }))

if (opts.map) {
	engine.pickMap = () => opts.map + '.txt'
}

const game = engine.planAllGames(users).games[0]
const { heroes } = game

function carefulAssasin() {
	if (game.activeHero.health < 50) {
		return helpers.findNearestHealthWell(game)
	}
	return helpers.findNearestWeakerEnemy(game)	|| helpers.findNearestEnemy(game)
}

function safeMiner() {
	const well = helpers.findNearestHealthWell(game)
	if (well && game.activeHero.health < 40) {
		return well
	}
	return helpers.findNearestNonTeamDiamondMine(game) || carefulAssasin()
}

function addColor(tile, color = null) {
	const { getCode } = tile
	tile.getCode = function () {
		let code = getCode.call(this)
		if (color) code = color(code)
		return this.bg ? this.bg(code) : code
	}
}

const myHero = heroes[Math.floor(Math.random() * heroes.length)]

heroes.forEach((hero) => {
	hero.getCode = function () {
		return this.name[0] + Math.min(this.health, 99)
	}
	if (hero === myHero) {
		hero.name = 'Hero'
		hero.move = require(`../hero${opts.src ? '.src' : ''}.js`)
		addColor(hero, colors.black.bold)
		hero.bg = colors.bgWhite
	} else if (hero.team === myHero.team) {
		hero.name = 'Ally'
		addColor(hero, colors.green.bold)
		hero.move = Math.random() < 0.5 ? safeMiner : carefulAssasin
	} else {
		hero.name = 'Enemy'
		addColor(hero, colors.red.bold)
		hero.move = Math.random() < 0.5 ? safeMiner : carefulAssasin
	}
})

game.healthWells.forEach((well) => {
	addColor(well, colors.cyan)
})

game.diamondMines.forEach((mine) => {
	addColor(mine, colors.grey)
})

game.impassables.forEach((wall) => {
	addColor(wall, colors.gray)
})

addColor(engine.getUnoccupied().prototype)

step()

function step() {
	const { turn, ended, activeHero: hero } = game
	const { health } = hero
	const direction = hero.move(game, helpers)
	game.handleHeroTurn(direction)

	if (turn === 1 || hero === myHero || opts.allHeroes || ended) {
		console.log('<<<<<<<<<<< >>>>>>>>>>>>>>>>')
		console.log('Turn ' + turn + ':')
		console.log(hero.name, 'tried to move', direction)
		console.log(hero.name, 'health is', hero.health, '<--', health)

		game.diamondMines.forEach((mine) => {
			mine.bg = !mine.owner ? null : mine.owner.team === myHero.team ? colors.bgGreen : colors.bgRed
		})

		let dest
		if (hero === myHero) {
			dest = hero.destination
			if (dest) {
				if (dest !== hero) {
					dest.bg = colors.bgYellow
				}
				const caption = dest.getCode && dest.getCode().trim() || dest.name || dest.type
				console.log(hero.name, 'towards', caption, 'at', dest.pos)
			}
			if (hero.plan) {
				console.log(hero.name, 'picked plan', hero.plan.toString())
			}
		}

		game.board.inspect()

		if (dest && dest !== hero) {
			dest.bg = null
		}
	}

	if (ended) {
		if (myHero.won) {
			console.log('->', myHero.name, 'WON!')
		} else {
			console.log('->', myHero.name, 'LOST!')
		}
		if (myHero.dead) {
			console.log('->', myHero.name, 'was DEAD by the end')
		}
		console.log('->', myHero.name, 'killed', myHero.heroesKilled.length, 'enemies')
		console.log('->', myHero.name, 'robbed', myHero.gravesRobbed, 'graves')
		console.log('->', myHero.name, 'has', myHero.diamondsEarned, 'diamonds')
		console.log('->', myHero.name, 'has', myHero.minesCaptured, 'mines')
		console.log('->', myHero.name, 'healed', myHero.healthGiven, 'hp')
		process.exit()
	}

	const timeout = myHero.dead ? 1 : Math.ceil(opts.wait / (hero === myHero ? 1 : 10))
	setTimeout(step, timeout)
}
