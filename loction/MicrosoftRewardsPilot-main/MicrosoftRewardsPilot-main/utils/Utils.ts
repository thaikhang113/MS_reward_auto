import ms from 'ms'

export default class Util {

    async wait(ms: number): Promise<void> {
        return new Promise<void>((resolve) => {
            setTimeout(resolve, ms)
        })
    }

    getFormattedDate(ms = Date.now()): string {
        const today = new Date(ms)
        const month = String(today.getMonth() + 1).padStart(2, '0')  // January is 0
        const day = String(today.getDate()).padStart(2, '0')
        const year = today.getFullYear()

        return `${month}/${day}/${year}`
    }

    shuffleArray<T>(array: T[]): T[] {
        const newArray = [...array]
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            const temp = newArray[i]!
            newArray[i] = newArray[j]!
            newArray[j] = temp
        }
        return newArray
    }

    randomNumber(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min
    }

    chunkArray<T>(arr: T[], numChunks: number): T[][] {
        const chunkSize = Math.ceil(arr.length / numChunks)
        const chunks: T[][] = []

        for (let i = 0; i < arr.length; i += chunkSize) {
            const chunk = arr.slice(i, i + chunkSize)
            chunks.push(chunk)
        }

        return chunks
    }

    stringToMs(input: string | number): number {
        const milisec = ms(input.toString())
        if (!milisec) {
            throw new Error('The string provided cannot be parsed to a valid time! Use a format like "1 min", "1m" or "1 minutes"')
        }
        return milisec
    }

    /**
     * 检查当前是否是最佳活动时间
     */
    isOptimalActivityTime(): boolean {
        const hour = new Date().getHours()
        
        // 避免深夜活动（2-6点）
        if (hour >= 2 && hour <= 6) {
            return false
        }
        
        // 高峰时间：早上7-9点，中午12-13点，晚上19-22点
        const peakHours = [7, 8, 9, 12, 13, 19, 20, 21, 22]
        
        // 80%概率在高峰时间活动，20%概率在其他时间
        if (peakHours.includes(hour)) {
            return true
        } else {
            return Math.random() < 0.2
        }
    }

    /**
     * 获取会话持续时间建议（毫秒）
     */
    getRecommendedSessionDuration(): number {
        // 15-30分钟的随机会话时长
        const minDuration = 15 * 60 * 1000  // 15分钟
        const maxDuration = 30 * 60 * 1000  // 30分钟
        return this.randomNumber(minDuration, maxDuration)
    }

    /**
     * 计算下次运行的延迟时间（毫秒）
     */
    getNextRunDelay(): number {
        // 2-4小时的随机间隔
        const minDelay = 2 * 60 * 60 * 1000  // 2小时
        const maxDelay = 4 * 60 * 60 * 1000  // 4小时
        return this.randomNumber(minDelay, maxDelay)
    }

}