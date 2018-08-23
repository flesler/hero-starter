// Copy to outer scope each turn
let game
let helpers

const DIRS = ['North', 'South', 'East', 'West']
const STAY = 'Stay'
const IGNORE_MINES = true

const MAX_HEALTH = 100
const AREA_DMG = 20
const HIT_DMG = 30

function getDirections(from, to) {
	const dirs = []
	if (to.distanceFromTop > from.distanceFromTop) dirs.push('South')
	if (to.distanceFromTop < from.distanceFromTop) dirs.push('North')
	if (to.distanceFromLeft > from.distanceFromLeft) dirs.push('East')
	if (to.distanceFromLeft < from.distanceFromLeft) dirs.push('West')
	return dirs
}

function closest(filter) {
	if (typeof filter === 'object') {
		const obj = filter
		filter = function (tile) { return tile === obj }
	}
	return helpers.findNearestObjectDirectionAndDistance(game.board, game.activeHero, filter)
}

function distanceTo(to) {
	const tile = closest(to)
	return tile ? tile.distance : 99
}

function directionTo(to) {
	const tile = closest(to)
	return tile ? tile.direction : null
}

function getEnemies() {
	const heroTeam = game.activeHero.team
	return game.teams[1 - heroTeam].filter(enemy => !enemy.dead)
}

function turnsToDie(hero) {
	const health = typeof hero === 'number' ? hero : hero.health
	return Math.ceil(Math.max(0, health) / HIT_DMG)
}

function reactToEnemy(enemy) {
	const hero = game.activeHero
	let te = turnsToDie(enemy)
	let th = turnsToDie(hero)
	switch (distanceTo(enemy)) {
		case 1:
			// Sure kill
			return te === 1 ? 'attack' :
				// There's no escape and we can win
				!nextToWell(enemy) && te <= th ? 'attack' : 'run'

		case 2:
			// Sure kill
			te = turnsToDie(enemy.health - AREA_DMG)
			return te === 0 ? 'attack' :
				// Can win even if hitting only 20 this turn
				!nextToWell(enemy) && te < th ? 'attack' : 'run'

		case 3:
			th = turnsToDie(hero.health - AREA_DMG)
			// Can win even if he hits first
			return te <= th ? 'attack' :
				// TODO: Avoid locks due to static enemy
				!isHurt(hero) ? 'stay' :
					isAThreat(enemy) ? 'run' : null
	}
	return null
}

function getTile(x, y) {
	const board = game.board
	return board.tiles[y] && board.tiles[y][x]
}

function getTileOnDirection(dir) {
	const hero = game.activeHero
	return helpers.getTileNearby(game.board, hero.distanceFromTop, hero.distanceFromLeft, dir)
}

function tilesAround(tile) {
	const x = tile.distanceFromLeft
	const y = tile.distanceFromTop
	return [
		getTile(x - 1, y),
		getTile(x, y - 1),
		getTile(x + 1, y),
		getTile(x, y + 1),
	].filter(t => !!t)
}

function nextToWell(hero) {
	return tilesAround(hero).find(isHealthWell)
}

function threatsCloseBy() {
	return getEnemies().filter(enemy => (
		// In order to make this number 3 instead of 2 and be
		// extra careful about assassins, I need some speculation
		// about the risks, else my guy will always run
		isAThreat(enemy) && distanceTo(enemy) <= 3
	))
}

function tileId(tile) {
	return tile.distanceFromLeft + '|' + tile.distanceFromTop
}

function directionIsBlocked(dir) {
	const tile = getTileOnDirection(dir)
	return !tile || tile.type !== 'Unoccupied'
}

function inferHeroType(hero) {
	// Assume most people either go for kills or mines
	const miner = hero.minesCaptured > 0
	const killer = hero.heroesKilled.length > 0
	if (miner === killer) return 'unknown'
	return killer ? 'killer' : 'miner'
}

function isAThreat(enemy) {
	return inferHeroType(enemy) !== 'miner'
}

function isHealthWell(tile) {
	return tile.type === 'HealthWell'
}

function isHero(tile) {
	return tile.type === 'Hero'
}

function isEnemy(tile) {
	return game.activeHero.team !== tile.team
}

function isAlly(tile) {
	return game.activeHero.team === tile.team
}

function isHurt(hero, dmg = 1) {
	const min = MAX_HEALTH - dmg
	return hero.health <= min
}

function deathMatchMode() {
	const hero = game.activeHero
	const lowHp = isHurt(hero, AREA_DMG)
	const otherHero = tilesAround(hero)
		.filter(isHero)
		.filter(tile => (
			// Target enemies
			isEnemy(tile) ||
			// or target wounded allies if not lowHp
			(!lowHp && isHurt(tile, AREA_DMG))
		))
		.sort((h1, h2) => h1.health - h2.health)[0]

	// If we can kill immediately it's best to attack regardless
	// TODO: Avoid hitting is health <= 20 and at well, since will still kill
	if (otherHero && isEnemy(otherHero) && otherHero.health <= HIT_DMG) {
		return directionTo(otherHero)
	}
	// If we made it to the well, attack or heal unless low hp
	if (!nextToWell(hero) || lowHp || !otherHero) {
		// Go to THE well asap or heal if next to it
		return helpers.findNearestHealthWell(game) ||
			// If all 4 tiles around it are taken, follow an ally
			helpers.findNearestTeamMember(game) ||
			// If no ally, then a weaker enemy
			helpers.findNearestWeakerEnemy(game) ||
			// Otherwise, any enemy
			helpers.findNearestEnemy(game)
	}
	return directionTo(otherHero)
}

// Moncho the "try-hard"
module.exports = (_game, _helpers) => {
	// Save to outer scope
	game = _game
	helpers = _helpers

	if (game.healthWells.length === 1) {
		return deathMatchMode()
	}

	const hero = game.activeHero
	const enemies = { run: [], attack: [], stay: [] }
	getEnemies().forEach((enemy) => {
		const reaction = reactToEnemy(enemy)
		if (reaction) enemies[reaction].push(enemy)
	})

	const surrounding = threatsCloseBy()
	if (surrounding.length > 1) {
		// Run from all enemies if surrounded
		enemies.run = surrounding
	}
	// Escape
	if (enemies.run.length) {
		// Don't bother running
		if (nextToWell(hero)) return helpers.findNearestHealthWell(game)

		const danger = {}
		// Get all the dangerous directions
		enemies.run.forEach((enemy) => {
			getDirections(hero, enemy).forEach((dir) => {
				danger[dir] = true
			})
		})
		// Add blocked directions as well
		DIRS.forEach((dir) => {
			if (directionIsBlocked(dir)) {
				danger[dir] = true
			}
		})
		// There's somewhere to run
		if (Object.keys(danger).length < 4) {
			// Run to the closest well, as long as it isn't through enemies
			const visited = {}
			let tile
			do {
				tile = closest((w) => {
					if (!isHealthWell(w)) return false
					const id = tileId(w)
					if (visited[id]) return false
					visited[id] = true
					return true
				})
				const dir = tile && directionTo(tile)
				if (dir && !danger[dir]) {
					return dir
				}
			} while (tile)
			// If all wells blocked, just try to stay away
			return DIRS.filter(dir => !danger[dir])[0]
		}
	}

	if (enemies.attack.length) {
		// Attack closest. TODO: look for best (distance * 100 + health)
		return directionTo(enemy => enemies.attack.indexOf(enemy) !== -1)
	}

	if (enemies.stay.length) {
		return STAY
	}

	// Unhealthy, go heal
	// if (turnsToDie(hero) === 1) {
	if (isHurt(hero)) {
		return helpers.findNearestHealthWell(game)
	}

	// TODO: Prioritize within those at the same distance, specially attack/heal/run

	// Look for closest tile of interest
	const direction = directionTo((tile) => {
		const dist = distanceTo(tile)
		const closeBy = dist < 6
		const adjacent = dist <= 1
		// Find the closest valuable tile
		switch (tile.type) {
			case 'Hero':
				// Ally
				if (isAlly(tile)) {
					// Be a good samaritan, heal the poor dude
					if (isHurt(tile, HIT_DMG) && adjacent) {
						return true
					}
					break
				}

				// Go after wounded enemies
				if (closeBy && turnsToDie(tile) < turnsToDie(hero)) {
					return true
				}

				break
			case 'HealthWell':
				// Close-by well, heal fully
				return isHurt(hero)
			case 'DiamondMine':
				// Don't go grabbing mines unless full health
				if (isHurt(hero)) {
					break
				}
				if (IGNORE_MINES) {
					// Disregard mines now, let's try a full murderer
					break
				}
				// If the difference is too big for either team, don't waste time
				const diamonds = game.totalTeamDiamonds
				const we = game.activeHero.team
				const diff = Math.abs(diamonds[we] - diamonds[1 - we])
				if (diff > 100) {
					break
				}

				return closeBy && (!tile.owner || tile.owner.team !== hero.team)
				// This greedy version is cool but can get into deadlocks with other greedy allies
				// return (!tile.owner || tile.owner.id !== hero.id);
			case 'Unoccupied':
				// Snatch those bones
				return tile.subType === 'Bones' && closeBy
		}

		return false
	})

	// If healthy, winning on diamonds and no graves or hurt enemies, go for a fair mines or a fair fight
	return direction ||
		helpers.findNearestEnemy(game) ||
		helpers.findNearestTeamMember(game) ||
		helpers.findNearestNonTeamDiamondMine(game)
}
