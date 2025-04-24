"use client"

import type React from "react"
import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import confetti from "canvas-confetti"

// Types
type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT"
type Position = { x: number; y: number }
type Theme = "forest" | "desert" | "ocean"
type GameResult = "win" | "lose" | "draw" | null

// Constants
const GRID_SIZE = 20
const CELL_SIZE = 20
const INITIAL_SNAKE: Position[] = [
  { x: 10, y: 10 },
  { x: 9, y: 10 },
]
const INITIAL_AI_SNAKE: Position[] = [
  { x: 5, y: 5 },
  { x: 4, y: 5 },
]
const INITIAL_DIRECTION: Direction = "RIGHT"
const INITIAL_SPEED = 300
const SPEED_INCREMENT = 5
const MIN_SPEED = 100
const GAME_DURATION = 180 // 3 minutes
const AI_DIFFICULTY = 0.7 // 0-1, higher means smarter AI
const DANGER_DISTANCE = 2 // Only avoid player when this close or closer

const SnakeGame: React.FC = () => {
  const [snake, setSnake] = useState<Position[]>(INITIAL_SNAKE)
  const [aiSnake, setAiSnake] = useState<Position[]>(INITIAL_AI_SNAKE)
  const [direction, setDirection] = useState<Direction>(INITIAL_DIRECTION)
  const [aiDirection, setAiDirection] = useState<Direction>(INITIAL_DIRECTION)
  const [food, setFood] = useState<Position>(generateFood())
  const [playerScore, setPlayerScore] = useState(0)
  const [aiScore, setAiScore] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [gameResult, setGameResult] = useState<GameResult>(null)
  const [speed, setSpeed] = useState(INITIAL_SPEED)
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [theme, setTheme] = useState<Theme>("forest")
  const [isPaused, setIsPaused] = useState(false)

  const nextDirectionRef = useRef<Direction | null>(null)
  const gameLoopRef = useRef<NodeJS.Timeout>()
  const gameOverRef = useRef<HTMLDivElement>(null)

  function generateFood(): Position {
    const newFood = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    }
    if (isPositionOccupied(newFood, [...snake, ...aiSnake])) {
      return generateFood()
    }
    return newFood
  }

  function isPositionOccupied(pos: Position, occupiedPositions: Position[]): boolean {
    return occupiedPositions.some((p) => p.x === pos.x && p.y === pos.y)
  }

  const moveSnake = useCallback(() => {
    setSnake((prevSnake) => {
      const newSnake = [...prevSnake]
      const head = { ...newSnake[0] }

      let newDirection = direction
      if (nextDirectionRef.current && isValidDirection(direction, nextDirectionRef.current)) {
        newDirection = nextDirectionRef.current
        nextDirectionRef.current = null
      }

      switch (newDirection) {
        case "UP":
          head.y = head.y - 1
          break
        case "DOWN":
          head.y = head.y + 1
          break
        case "LEFT":
          head.x = head.x - 1
          break
        case "RIGHT":
          head.x = head.x + 1
          break
      }

      // 添加边界检测
      if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
        endGame("lose")
        return prevSnake
      }

      setDirection(newDirection)

      // Check collision with AI snake
      if (isPositionOccupied(head, aiSnake)) {
        endGame("lose")
        return prevSnake
      }

      // Check collision with self (excluding the tail which will move)
      // Only check if snake length > 1
      if (prevSnake.length > 1) {
        // Check against all segments except the tail (which will move)
        const bodyWithoutTail = prevSnake.slice(0, -1)
        if (isPositionOccupied(head, bodyWithoutTail)) {
          endGame("lose")
          return prevSnake
        }
      }

      newSnake.unshift(head)

      // Check if snake ate food
      if (head.x === food.x && head.y === food.y) {
        setPlayerScore((prevScore) => prevScore + 1)
        setFood(generateFood())
        setSpeed((prevSpeed) => {
          const newSpeed = prevSpeed - SPEED_INCREMENT
          return newSpeed > MIN_SPEED ? newSpeed : prevSpeed
        })
      } else {
        newSnake.pop()
      }

      return newSnake
    })
  }, [direction, food, aiSnake])

  // Get next position based on current position and direction
  const getNextPosition = (pos: Position, dir: Direction): Position => {
    const nextPos = { ...pos }
    switch (dir) {
      case "UP":
        nextPos.y = nextPos.y - 1
        break
      case "DOWN":
        nextPos.y = nextPos.y + 1
        break
      case "LEFT":
        nextPos.x = nextPos.x - 1
        break
      case "RIGHT":
        nextPos.x = nextPos.x + 1
        break
    }
    return nextPos
  }

  // Check if a position is safe (not occupied by player snake or AI snake)
  const isSafePosition = (pos: Position, playerSnake: Position[], aiSnake: Position[]): boolean => {
    return !isPositionOccupied(pos, [...playerSnake, ...aiSnake])
  }

  // Calculate Manhattan distance between two positions
  const calculateDistance = (pos1: Position, pos2: Position): number => {
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y)
  }

  // Evaluate a direction for AI movement
  const evaluateDirection = (
    dir: Direction,
    head: Position,
    food: Position,
    playerSnake: Position[],
    aiSnake: Position[],
  ): number => {
    const nextPos = getNextPosition(head, dir)

    // Check if next position is out of bounds
    if (nextPos.x < 0 || nextPos.x >= GRID_SIZE || nextPos.y < 0 || nextPos.y >= GRID_SIZE) {
      return -1000 // Very bad score for out of bounds
    }

    // Check if next position is safe
    if (!isSafePosition(nextPos, playerSnake, aiSnake.slice(0, -1))) {
      return -1000 // Very bad score for unsafe positions
    }

    // Calculate distance to food
    const distanceToFood = calculateDistance(nextPos, food)

    // Calculate distance to player's head
    const distanceToPlayerHead = calculateDistance(nextPos, playerSnake[0])

    // Calculate minimum distance to any player segment
    let minDistanceToPlayer = GRID_SIZE * 2 // Initialize with a large value
    for (const segment of playerSnake) {
      const distance = calculateDistance(nextPos, segment)
      if (distance < minDistanceToPlayer) {
        minDistanceToPlayer = distance
      }
    }

    // Score calculation: prioritize food but avoid player only when very close
    // Higher score is better
    let score = 0

    // Distance to food (closer is better) - this is the primary goal
    score -= distanceToFood * 20 // Increased weight for food

    // Only avoid player when very close (DANGER_DISTANCE or closer)
    if (minDistanceToPlayer <= DANGER_DISTANCE) {
      score -= (DANGER_DISTANCE - minDistanceToPlayer + 1) * 100 // Strong avoidance only when very close
    }

    // Slightly prefer open spaces
    const openDirections = ["UP", "DOWN", "LEFT", "RIGHT"].filter((d) => {
      const testPos = getNextPosition(nextPos, d as Direction)
      // Check bounds first
      if (testPos.x < 0 || testPos.x >= GRID_SIZE || testPos.y < 0 || testPos.y >= GRID_SIZE) {
        return false
      }
      return isSafePosition(testPos, playerSnake, aiSnake.slice(0, -1))
    }).length
    score += openDirections * 2 // Reduced weight for open spaces

    return score
  }

  const moveAiSnake = useCallback(() => {
    setAiSnake((prevAiSnake) => {
      const newAiSnake = [...prevAiSnake]
      const head = { ...newAiSnake[0] }

      // Evaluate all possible directions
      const directions: Direction[] = ["UP", "DOWN", "LEFT", "RIGHT"]
      let bestDirection = aiDirection
      let bestScore = Number.NEGATIVE_INFINITY

      // Random factor to make AI less predictable
      const randomFactor = Math.random() > AI_DIFFICULTY

      if (randomFactor) {
        // Sometimes make random but safe moves
        const safeMoves = directions.filter((dir) => {
          // Don't go backwards
          if (
            (dir === "UP" && aiDirection === "DOWN") ||
            (dir === "DOWN" && aiDirection === "UP") ||
            (dir === "LEFT" && aiDirection === "RIGHT") ||
            (dir === "RIGHT" && aiDirection === "LEFT")
          ) {
            return false
          }

          const nextPos = getNextPosition(head, dir)

          // Check bounds
          if (nextPos.x < 0 || nextPos.x >= GRID_SIZE || nextPos.y < 0 || nextPos.y >= GRID_SIZE) {
            return false
          }

          // Check collision with self (excluding tail)
          if (isPositionOccupied(nextPos, newAiSnake.slice(0, -1))) {
            return false
          }

          return !isPositionOccupied(nextPos, snake)
        })

        if (safeMoves.length > 0) {
          bestDirection = safeMoves[Math.floor(Math.random() * safeMoves.length)]
        }
      } else {
        // Otherwise make smart moves
        for (const dir of directions) {
          // Skip directions that would cause immediate collision with itself
          if (
            (dir === "UP" && aiDirection === "DOWN") ||
            (dir === "DOWN" && aiDirection === "UP") ||
            (dir === "LEFT" && aiDirection === "RIGHT") ||
            (dir === "RIGHT" && aiDirection === "LEFT")
          ) {
            continue
          }

          const score = evaluateDirection(dir, head, food, snake, newAiSnake)
          if (score > bestScore) {
            bestScore = score
            bestDirection = dir
          }
        }
      }

      // Move in the best direction
      const nextHead = getNextPosition(head, bestDirection)
      setAiDirection(bestDirection)

      // Check if AI would move out of bounds
      if (nextHead.x < 0 || nextHead.x >= GRID_SIZE || nextHead.y < 0 || nextHead.y >= GRID_SIZE) {
        setPlayerScore((prevScore) => prevScore + 2)
        return INITIAL_AI_SNAKE
      }

      // Check collision with player snake
      if (isPositionOccupied(nextHead, snake)) {
        setPlayerScore((prevScore) => prevScore + 2)
        return INITIAL_AI_SNAKE
      }

      // Check collision with self (excluding the tail which will move)
      if (prevAiSnake.length > 1) {
        const bodyWithoutTail = prevAiSnake.slice(0, -1)
        if (isPositionOccupied(nextHead, bodyWithoutTail)) {
          setPlayerScore((prevScore) => prevScore + 2)
          return INITIAL_AI_SNAKE
        }
      }

      newAiSnake.unshift(nextHead)

      // Check if AI snake ate food
      if (nextHead.x === food.x && nextHead.y === food.y) {
        setAiScore((prevScore) => prevScore + 1)
        setFood(generateFood())
      } else {
        newAiSnake.pop()
      }

      return newAiSnake
    })
  }, [food, snake, aiDirection])

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const newDirection = getNewDirection(e.key.toLowerCase())
      if (newDirection) {
        nextDirectionRef.current = newDirection
      }
      if (e.key === " ") {
        setIsPaused((prev) => !prev)
      }
    }

    window.addEventListener("keydown", handleKeyPress)

    return () => {
      window.removeEventListener("keydown", handleKeyPress)
    }
  }, [])

  function getNewDirection(key: string): Direction | null {
    switch (key) {
      case "w":
        return "UP"
      case "s":
        return "DOWN"
      case "a":
        return "LEFT"
      case "d":
        return "RIGHT"
      default:
        return null
    }
  }

  function isValidDirection(currentDirection: Direction, newDirection: Direction): boolean {
    return (
      (currentDirection === "UP" && newDirection !== "DOWN") ||
      (currentDirection === "DOWN" && newDirection !== "UP") ||
      (currentDirection === "LEFT" && newDirection !== "RIGHT") ||
      (currentDirection === "RIGHT" && newDirection !== "LEFT")
    )
  }

  const endGame = (result: GameResult) => {
    setGameOver(true)
    setGameResult(result)

    // If player wins, trigger confetti
    if (result === "win") {
      setTimeout(() => {
        const duration = 5 * 1000
        const animationEnd = Date.now() + duration
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 }

        function randomInRange(min: number, max: number) {
          return Math.random() * (max - min) + min
        }

        const interval: any = setInterval(() => {
          const timeLeft = animationEnd - Date.now()

          if (timeLeft <= 0) {
            return clearInterval(interval)
          }

          const particleCount = 50 * (timeLeft / duration)

          // Since particles fall down, start a bit higher than random
          confetti({
            ...defaults,
            particleCount,
            origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
          })
          confetti({
            ...defaults,
            particleCount,
            origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
          })
        }, 250)
      }, 500)
    }
  }

  useEffect(() => {
    const gameLoop = () => {
      if (!isPaused) {
        moveSnake()
        // AI snake moves at 3/4 the speed of the player
        if (Math.random() < 0.75) {
          moveAiSnake()
        }
      }
      gameLoopRef.current = setTimeout(gameLoop, speed)
    }

    if (!gameOver) {
      gameLoopRef.current = setTimeout(gameLoop, speed)
    }

    return () => {
      if (gameLoopRef.current) {
        clearTimeout(gameLoopRef.current)
      }
    }
  }, [gameOver, moveSnake, moveAiSnake, speed, isPaused])

  useEffect(() => {
    const timer = setInterval(() => {
      if (!isPaused) {
        setTimeLeft((prevTime) => {
          if (prevTime <= 0) {
            // Time's up - determine winner based on scores
            if (playerScore > aiScore) {
              endGame("win")
            } else if (aiScore > playerScore) {
              endGame("lose")
            } else {
              endGame("draw")
            }
            clearInterval(timer)
            return 0
          }
          return prevTime - 1
        })
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [isPaused, playerScore, aiScore])

  const resetGame = () => {
    setSnake(INITIAL_SNAKE)
    setAiSnake(INITIAL_AI_SNAKE)
    setDirection(INITIAL_DIRECTION)
    setAiDirection(INITIAL_DIRECTION)
    setFood(generateFood())
    setPlayerScore(0)
    setAiScore(0)
    setGameOver(false)
    setGameResult(null)
    setSpeed(INITIAL_SPEED)
    setTimeLeft(GAME_DURATION)
    nextDirectionRef.current = null
    setIsPaused(false)
  }

  // Theme-specific styles
  const getThemeStyles = () => {
    const commonStyles = {
      playerSnake: "bg-green-600 border-green-800",
      aiSnake: "bg-red-500 border-red-700",
    }

    switch (theme) {
      case "forest":
        return {
          background: "bg-gradient-to-b from-green-100 to-green-200",
          board: "bg-green-300 border-green-800 shadow-lg",
          playerSnake: commonStyles.playerSnake,
          aiSnake: commonStyles.aiSnake,
          food: "bg-yellow-400 border-yellow-600",
          foodEmoji: "🍎",
          centerPattern: (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
              <div className="text-green-900 text-[200px]">🌳</div>
            </div>
          ),
        }
      case "desert":
        return {
          background: "bg-gradient-to-b from-yellow-100 to-yellow-200",
          board: "bg-yellow-300 border-yellow-800 shadow-lg",
          playerSnake: commonStyles.playerSnake,
          aiSnake: commonStyles.aiSnake,
          food: "bg-green-500 border-green-700",
          foodEmoji: "🌵",
          centerPattern: (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
              <div className="text-amber-900 text-[200px]">🏜️</div>
            </div>
          ),
        }
      case "ocean":
        return {
          background: "bg-gradient-to-b from-blue-100 to-blue-200",
          board: "bg-blue-300 border-blue-800 shadow-lg",
          playerSnake: commonStyles.playerSnake,
          aiSnake: commonStyles.aiSnake,
          food: "bg-yellow-300 border-yellow-500",
          foodEmoji: "🐠",
          centerPattern: (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
              <div className="text-blue-900 text-[200px]">🌊</div>
            </div>
          ),
        }
      default:
        return {
          background: "bg-white",
          board: "bg-gray-200 border-gray-800",
          playerSnake: commonStyles.playerSnake,
          aiSnake: commonStyles.aiSnake,
          food: "bg-yellow-500 border-yellow-600",
          foodEmoji: "🍎",
          centerPattern: null,
        }
    }
  }

  const themeStyles = getThemeStyles()

  return (
    <div className={`w-full min-h-screen flex items-center justify-center p-4 ${themeStyles.background}`}>
      <Card className="w-full max-w-2xl shadow-xl">
        <CardContent className="p-6">
          <h1 className="text-3xl font-bold text-center mb-4">Snake Game</h1>

          <div className="flex justify-between mb-4 p-2 rounded-lg bg-opacity-80 bg-white">
            <div className="flex items-center">
              <span className="font-bold mr-2">You:</span>
              <span className="text-xl text-green-600">{playerScore}</span>
            </div>
            <div className="flex items-center">
              <span className="font-bold mr-2">Time:</span>
              <span className="text-xl">
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
              </span>
            </div>
            <div className="flex items-center">
              <span className="font-bold mr-2">AI:</span>
              <span className="text-xl text-red-600">{aiScore}</span>
            </div>
          </div>

          <div className="mb-4 text-sm text-center p-2 bg-gray-100 rounded-lg">
            使用 <kbd className="px-2 py-1 bg-gray-200 rounded">W</kbd> (上),
            <kbd className="px-2 py-1 bg-gray-200 rounded">S</kbd> (下),
            <kbd className="px-2 py-1 bg-gray-200 rounded">A</kbd> (左),
            <kbd className="px-2 py-1 bg-gray-200 rounded">D</kbd> (右) 键控制蛇的移动，
            <kbd className="px-2 py-1 bg-gray-200 rounded">空格</kbd> 键暂停/继续游戏
          </div>

          <div className={`relative w-[400px] h-[400px] mx-auto ${themeStyles.board} rounded-lg overflow-hidden`}>
            {/* Center theme pattern */}
            {themeStyles.centerPattern}

            {snake.map((segment, index) => (
              <div
                key={`player-${index}`}
                className={`absolute ${themeStyles.playerSnake} ${index === 0 ? "rounded-full" : "rounded"}`}
                style={{
                  left: `${segment.x * CELL_SIZE}px`,
                  top: `${segment.y * CELL_SIZE}px`,
                  width: `${CELL_SIZE}px`,
                  height: `${CELL_SIZE}px`,
                  zIndex: index === 0 ? 3 : 2,
                }}
              />
            ))}

            {aiSnake.map((segment, index) => (
              <div
                key={`ai-${index}`}
                className={`absolute ${themeStyles.aiSnake} ${index === 0 ? "rounded-full" : "rounded"}`}
                style={{
                  left: `${segment.x * CELL_SIZE}px`,
                  top: `${segment.y * CELL_SIZE}px`,
                  width: `${CELL_SIZE}px`,
                  height: `${CELL_SIZE}px`,
                  zIndex: index === 0 ? 3 : 2,
                }}
              />
            ))}

            <div
              className={`absolute ${themeStyles.food} rounded-full flex items-center justify-center`}
              style={{
                left: `${food.x * CELL_SIZE}px`,
                top: `${food.y * CELL_SIZE}px`,
                width: `${CELL_SIZE}px`,
                height: `${CELL_SIZE}px`,
                zIndex: 1,
              }}
            >
              <span className="text-xs">{themeStyles.foodEmoji}</span>
            </div>
          </div>

          <div className="mt-4 flex justify-between items-center">
            <div className="text-center font-bold">{isPaused ? "游戏已暂停" : "游戏进行中"}</div>
            <Button onClick={resetGame} className="bg-blue-500 hover:bg-blue-600" disabled={gameOver}>
              重新开始
            </Button>
          </div>

          <div className="mt-6 flex justify-center space-x-4">
            <Button
              onClick={() => setTheme("forest")}
              className={`${theme === "forest" ? "bg-green-700" : "bg-green-500"} hover:bg-green-600`}
            >
              🌳 森林
            </Button>
            <Button
              onClick={() => setTheme("desert")}
              className={`${theme === "desert" ? "bg-amber-700" : "bg-amber-500"} hover:bg-amber-600`}
            >
              🏜️ 沙漠
            </Button>
            <Button
              onClick={() => setTheme("ocean")}
              className={`${theme === "ocean" ? "bg-blue-700" : "bg-blue-500"} hover:bg-blue-600`}
            >
              🌊 海洋
            </Button>
          </div>
        </CardContent>
      </Card>

      {gameOver && (
        <div ref={gameOverRef} className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-xl shadow-2xl text-center max-w-md w-full">
            {gameResult === "win" && (
              <>
                <h2 className="text-4xl font-bold mb-4 text-green-600">YOU WIN!</h2>
                <div className="py-4">
                  <div className="text-2xl mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-green-600">You:</span>
                      <span className="text-3xl">{playerScore}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-red-600">AI:</span>
                      <span className="text-3xl">{aiScore}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {gameResult === "lose" && (
              <>
                <h2 className="text-4xl font-bold mb-4 text-red-600">Game Over!</h2>
                <div className="py-4">
                  <div className="text-2xl mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-green-600">You:</span>
                      <span className="text-3xl">{playerScore}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-red-600">AI:</span>
                      <span className="text-3xl">{aiScore}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {gameResult === "draw" && (
              <>
                <h2 className="text-4xl font-bold mb-4 text-yellow-600">It's a Draw!</h2>
                <div className="py-4">
                  <div className="text-2xl mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-green-600">You:</span>
                      <span className="text-3xl">{playerScore}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-red-600">AI:</span>
                      <span className="text-3xl">{aiScore}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            <Button onClick={resetGame} className="px-8 py-2 text-lg">
              Play Again
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default SnakeGame
