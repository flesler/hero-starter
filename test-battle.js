const opts = require('commander')

opts
	.description('CLI to test the hero.js code locally')
	.option('-w, --wait <n>', 'Turn by turn step through of the battle', parseFloat, 1500)
	.option('-t, --turns <n>', 'Specifies how many turns to run', parseFloat, 1250)
	.option('-h, --only-hero', 'Show only hero turns')
	.option('-d, --deathmatch', 'Use a deathmatch map')
	.parse(process.argv)

// Get the helper file and the Game logic
const ai_battle_engine = require('ai-battle-engine')

const GameEngine = new ai_battle_engine()
const Game = GameEngine.getGame()

// Get my hero's move function ("brain")
const heroMoveFunction = require('./hero.js')

const regularMap =
'DPTDPTDPTDPT' +
'D..A.......D' +
'P.E.....E..P' +
'T.TTTD..E..T' +
'D.TA.......D' +
'P.T.P..A...P' +
'T.T..DA....T' +
'D.D.H......D' +
'P...E...E..P' +
'T..E.......T' +
'P......A...P' +
'TPTDPTDPTDPT'

const deathmatchMap =
'TTTTTTTTTTTTT' +
'T...........T' +
'T.E..A..E...T' +
'T.......A...T' +
'T..E........T' +
'T...........T' +
'T.....P.....T' +
'T..A......E.T' +
'T.....A.....T' +
'T.......E...T' +
'T..H.E......T' +
'T......A....T' +
'TTTTTTTTTTTTT'

function carefulAssasin(gameData, helpers) {
	const myHero = gameData.activeHero
	if (myHero.health < 50) {
		return helpers.findNearestHealthWell(gameData)
	}
	return helpers.findNearestWeakerEnemy(gameData)
		|| helpers.findNearestEnemy(gameData)
}

function safeMiner(gameData, helpers) {
	const myHero = gameData.activeHero
	// Get stats on the nearest health well
	const healthWellStats = helpers.findNearestObjectDirectionAndDistance(gameData.board, myHero, (boardTile) => {
		if (boardTile.type === 'HealthWell') {
			return true
		}
	})
	const distanceToHealthWell = healthWellStats.distance
	const directionToHealthWell = healthWellStats.direction
	if (myHero.health < 40) {
		return directionToHealthWell
	} else if (myHero.health < 100 && distanceToHealthWell === 1) {
		return directionToHealthWell
	}
	return helpers.findNearestNonTeamDiamondMine(gameData) || carefulAssasin(gameData, helpers)
}

// Map

const map = opts.deathmatch ? deathmatchMap : regularMap
const size = Math.sqrt(map.length)
const game = new Game(size)
game.maxTurn = opts.turns

let enemies = 0
let allies = 0
let myHero

for (let j = 0; j < size; j++) {
	for (let i = 0; i < size; i++) {
		const chr = map.charAt(i + j * size)
		switch (chr) {
			case '': break
			case 'D': game.addDiamondMine(j, i); break
			case 'P': game.addHealthWell(j, i); break
			case 'T': game.addImpassable(j, i); break
			case 'H': game.addHero(j, i, 'Hero', 0); break
			case 'A': game.addHero(j, i, 'Ally ' + (++allies), 0); break
			case 'E': game.addHero(j, i, 'Enemy ' + (++enemies), 1); break
		}
	}
}

if (enemies !== allies + 1) {
	throw new Error('Teams are unbalanced!')
}

game.heroes.forEach((hero) => {
	hero.getCode = function () {
		return this.name[0] + Math.min(this.health, 99)
		// return this.name.slice(0, 2) + this.name.slice(-1);
	}
	if (hero.name === 'Hero') {
		myHero = hero
		hero.move = heroMoveFunction
	} else {
		hero.move = Math.random() < 0.5 ? safeMiner : carefulAssasin
	}
})

step()

function step() {
	// Built-in end situation
	const hero = game.activeHero
	const direction = hero.move(game, require('./helpers.js'))
	game.handleHeroTurn(direction)
	if (game.turn === 1 || hero === myHero || !opts.onlyHero || game.ended) {
		// console.log('\n'.repeat(100))
		console.log('<<<<<<<<<<< >>>>>>>>>>>>>>>>')
		console.log('Turn ' + game.turn + ':')
		console.log(hero.name, 'tried to move', direction)
		console.log(hero.name, 'has', hero.health, 'health')
		console.log(hero.name, 'killed', hero.heroesKilled.length, 'enemies')
		console.log(hero.name, 'robbed', hero.gravesRobbed, 'graves')
		console.log(hero.name, 'has', hero.diamondsEarned, 'diamonds')
		console.log(hero.name, 'has', hero.mineCount, 'mines')
		console.log(hero.name, 'healed', hero.healthGiven, 'hp')
		game.board.inspect()
	}

	if (game.ended) {
		if (myHero.dead) {
			console.log('->', myHero.name, 'was DEAD by the end')
		}
		if (myHero.won) {
			console.log('->', myHero.name, 'WON!')
		} else {
			console.log('->', myHero.name, 'LOST!')
		}
		process.exit()
	}

	const timeout = Math.ceil(opts.wait / (hero === myHero ? 1 : 10));
	setTimeout(step, timeout)
}
