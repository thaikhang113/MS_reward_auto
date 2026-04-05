import { Page } from 'playwright'
import { DashboardData } from '../../interfaces/DashboardData'
import { MicrosoftRewardsBot } from '../index'

// 类型定义
interface UserProfile {
    name: string
    searchStyle: 'leisurely' | 'focused' | 'scattered'
    taskPreference: 'mixed' | 'sequential' | 'random'
    sessionDuration: { min: number, max: number }
    breakProbability: number
    multitaskingLevel: 'low' | 'medium' | 'high'
}



interface TaskInfo {
    name: string
    priority: 'high' | 'medium' | 'low'
    duration: { min: number, max: number }
}

interface BreakInfo {
    type: 'break'
    duration: { min: number, max: number }
    activity: string
}

interface TaskExecutionPlan {
    tasks: (TaskInfo | BreakInfo)[]
    estimatedDuration: number
}

export class UltraAntiDetectionScheduler {
    private bot: MicrosoftRewardsBot
    private currentSessionProfile: UserProfile
    
    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
        this.currentSessionProfile = this.generateUserProfile()
    }

    /**
     * 🎭 生成随机用户行为档案
     */
    public generateUserProfile(): UserProfile {
        const profiles: UserProfile[] = [
            {
                name: 'Casual User',
                searchStyle: 'leisurely',
                taskPreference: 'mixed',
                sessionDuration: { min: 10, max: 25 }, // 分钟
                breakProbability: 0.3,
                multitaskingLevel: 'low'
            },
            {
                name: 'Efficient User', 
                searchStyle: 'focused',
                taskPreference: 'sequential',
                sessionDuration: { min: 15, max: 35 },
                breakProbability: 0.2,
                multitaskingLevel: 'medium'
            },
            {
                name: 'Distracted User',
                searchStyle: 'scattered',
                taskPreference: 'random',
                sessionDuration: { min: 20, max: 45 },
                breakProbability: 0.4,
                multitaskingLevel: 'high'
            }
        ]
        
        const randomIndex = Math.floor(Math.random() * profiles.length)
        const profile = profiles[randomIndex]
        
        if (profile) {
            this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', `👤 Generated user profile: ${profile.name}`)
            return profile
        } else {
            // 默认配置文件
            const defaultProfile = profiles[0]
            if (defaultProfile) {
                this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', `👤 Using default profile: ${defaultProfile.name}`)
                return defaultProfile
            } else {
                // 硬编码的默认配置（万一profiles数组为空）
                return {
                    name: 'Default User',
                    searchStyle: 'leisurely',
                    taskPreference: 'mixed',
                    sessionDuration: { min: 10, max: 25 },
                    breakProbability: 0.3,
                    multitaskingLevel: 'medium'
                }
            }
        }
    }

    /**
     * 🕒 智能时间调度 - 基于真实用户活动模式
     */
    public isOptimalActivityTime(): boolean {
        const hour = new Date().getHours()
        const minute = new Date().getMinutes()
        
        // 真实用户活动热力图（基于统计数据）
        const activityHeatMap: Record<number, number> = {
            0: 0.05, 1: 0.02, 2: 0.01, 3: 0.01, 4: 0.01, 5: 0.02,
            6: 0.1, 7: 0.25, 8: 0.4, 9: 0.35, 10: 0.3, 11: 0.4,
            12: 0.5, 13: 0.35, 14: 0.3, 15: 0.35, 16: 0.4, 17: 0.45,
            18: 0.5, 19: 0.6, 20: 0.7, 21: 0.65, 22: 0.5, 23: 0.3
        }
        
        const baseActivity = activityHeatMap[hour] || 0.1
        
        // 分钟级别的微调（避开整点）
        let minuteModifier = 1.0
        if (minute >= 55 || minute <= 5) {
            minuteModifier = 0.7 // 整点前后活动度降低
        } else if (minute >= 25 && minute <= 35) {
            minuteModifier = 1.2 // 半点左右活动度略高
        }
        
        const activityScore = baseActivity * minuteModifier
        return Math.random() < activityScore
    }

    /**
     * 🎲 动态任务顺序生成
     */
    private generateDynamicTaskOrder(): TaskExecutionPlan {
        const tasks: TaskInfo[] = [
            { name: 'Daily Set', priority: 'high', duration: { min: 2, max: 5 } },
            { name: 'More Promotions', priority: 'medium', duration: { min: 3, max: 8 } },
            { name: 'Punch Cards', priority: 'low', duration: { min: 1, max: 3 } },
            { name: 'Desktop Search', priority: 'high', duration: { min: 8, max: 20 } }
        ]
        
        const shuffledTasks = [...tasks]
        
        // 根据用户档案调整任务顺序
        switch (this.currentSessionProfile.taskPreference) {
            case 'mixed':
                // 高优先级任务优先，但有30%概率随机
                if (Math.random() < 0.3) {
                    this.shuffleArray(shuffledTasks)
                } else {
                    shuffledTasks.sort((a, b) => this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority))
                }
                break
                
            case 'sequential':
                // 按固定顺序，但可能跳过某些任务
                break
                
            case 'random':
                // 完全随机
                this.shuffleArray(shuffledTasks)
                break
        }
        
        // 30%概率在任务间插入"休息"
        const tasksWithBreaks: (TaskInfo | BreakInfo)[] = []
        shuffledTasks.forEach((task, index) => {
            tasksWithBreaks.push(task)
            
            if (index < shuffledTasks.length - 1 && Math.random() < this.currentSessionProfile.breakProbability) {
                tasksWithBreaks.push({
                    type: 'break',
                    duration: { min: 1, max: 5 },
                    activity: this.getRandomBreakActivity()
                })
            }
        })
        
        return { tasks: tasksWithBreaks, estimatedDuration: this.calculateTotalDuration(tasksWithBreaks) }
    }

    /**
     * 🎪 会话中断和恢复模拟
     */
    public async simulateSessionInterruption(page: Page): Promise<void> {
        const interruptionTypes = [
            'phone_call', 'bathroom_break', 'coffee_break', 'distraction', 
            'notification_check', 'window_switch', 'tab_browsing'
        ]
        
        const randomIndex = Math.floor(Math.random() * interruptionTypes.length)
        const interruption = interruptionTypes[randomIndex] || 'coffee_break'
        const duration = 30000 + Math.random() * 120000 // 30秒到2.5分钟
        
        this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', `🔄 Simulating interruption: ${interruption} for ${Math.round(duration/1000)}s`)
        
        switch (interruption) {
            case 'tab_browsing':
                await this.simulateTabBrowsing(page)
                break
                
            case 'window_switch':
                await this.simulateWindowSwitch(page)
                break
                
            case 'notification_check':
                await this.simulateNotificationCheck(page)
                break
                
            default:
                // 简单等待
                await this.bot.utils.wait(duration)
                break
        }
    }

    /**
     * 🌐 标签页浏览模拟
     */
    public async simulateTabBrowsing(page: Page): Promise<void> {
        try {
            const context = page.context()
            const newTab = await context.newPage()
            
            // 访问一些常见的网站
            const commonSites = [
                'https://www.wikipedia.org',
                'https://www.youtube.com',
                'https://www.github.com',
                'https://www.stackoverflow.com'
            ]
            
            const randomIndex = Math.floor(Math.random() * commonSites.length)
            const site = commonSites[randomIndex] || 'https://www.wikipedia.org'
            
            await newTab.goto(site, { timeout: 10000 }).catch(() => {})
            await this.bot.utils.wait(5000 + Math.random() * 10000)
            
            // 模拟简单的浏览行为
            await newTab.keyboard.press('PageDown').catch(() => {})
            await this.bot.utils.wait(2000 + Math.random() * 3000)
            
            await newTab.close()
            
            this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', `📑 Tab browsing simulation: visited ${site}`)
        } catch (error) {
            this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', `Tab browsing failed: ${error}`, 'warn')
        }
    }

    /**
     * 🔄 窗口切换模拟
     */
    private async simulateWindowSwitch(page: Page): Promise<void> {
        try {
            // 模拟Alt+Tab操作
            await page.keyboard.down('Alt')
            await page.keyboard.press('Tab')
            await this.bot.utils.wait(1000 + Math.random() * 2000)
            await page.keyboard.up('Alt')
            
            // 等待一段时间模拟在其他窗口的活动
            await this.bot.utils.wait(10000 + Math.random() * 20000)
            
            // 返回当前窗口
            await page.bringToFront()
            
            this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', '🔄 Window switch simulation completed')
        } catch (error) {
            this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', `Window switch failed: ${error}`, 'warn')
        }
    }

    /**
     * 📱 通知检查模拟
     */
    private async simulateNotificationCheck(page: Page): Promise<void> {
        // 模拟检查通知的快速动作
        const quickActions = [
            () => page.keyboard.press('F5'), // 刷新
            () => page.keyboard.press('Escape'), // 取消操作
            () => page.mouse.move(0, 0) // 鼠标移到角落
        ]
        
        const randomIndex = Math.floor(Math.random() * quickActions.length)
        const action = quickActions[randomIndex]
        
        if (action) {
            await action().catch(() => {})
        }
        
        // 短暂停留
        await this.bot.utils.wait(2000 + Math.random() * 3000)
        
        this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', '📱 Notification check simulation')
    }

    /**
     * 🎯 高级多任务处理模拟
     */
    public async simulateMultitasking(page: Page, taskName: string): Promise<void> {
        if (this.currentSessionProfile.multitaskingLevel === 'low') return
        
        // 根据多任务水平决定分心程度
        const distractionProbability: Record<string, number> = {
            'low': 0.1,
            'medium': 0.25,
            'high': 0.4
        }
        
        const probability = distractionProbability[this.currentSessionProfile.multitaskingLevel] || 0.1
        
        if (Math.random() < probability) {
            this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', `🎯 Simulating multitasking during ${taskName}`)
            
            const multitaskActions = [
                () => this.simulateQuickSearch(page),
                () => this.simulateClipboardOperation(page),
                () => this.simulateTextSelection(page)
            ]
            
            const randomIndex = Math.floor(Math.random() * multitaskActions.length)
            const action = multitaskActions[randomIndex]
            
            if (action) {
                await action().catch(() => {})
            }
        }
    }

    /**
     * 🔍 快速搜索模拟
     */
    private async simulateQuickSearch(page: Page): Promise<void> {
        try {
            // 模拟Ctrl+F快速搜索
            await page.keyboard.down('Control')
            await page.keyboard.press('F')
            await page.keyboard.up('Control')
            
            await this.bot.utils.wait(500)
            
            // 输入一个常见的搜索词
            const searchTerms = ['test', 'search', 'find', 'look', 'check']
            const randomIndex = Math.floor(Math.random() * searchTerms.length)
            const term = searchTerms[randomIndex] || 'test'
            await page.keyboard.type(term)
            
            await this.bot.utils.wait(1000)
            
            // 取消搜索
            await page.keyboard.press('Escape')
            
            this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', `🔍 Quick search simulation: "${term}"`)
        } catch (error) {
            // 忽略错误
        }
    }

    /**
     * 📋 剪贴板操作模拟
     */
    private async simulateClipboardOperation(page: Page): Promise<void> {
        try {
            // 模拟选择文本并复制
            await page.keyboard.down('Control')
            await page.keyboard.press('A') // 全选
            await this.bot.utils.wait(300)
            await page.keyboard.press('C') // 复制
            await page.keyboard.up('Control')
            
            await this.bot.utils.wait(500)
            
            // 点击其他地方取消选择
            await page.mouse.click(100, 100)
            
            this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', '📋 Clipboard operation simulation')
        } catch (error) {
            // 忽略错误
        }
    }

    /**
     * 📝 文本选择模拟
     */
    private async simulateTextSelection(page: Page): Promise<void> {
        try {
            // 随机选择页面上的文本
            const startX = 100 + Math.random() * 300
            const startY = 200 + Math.random() * 200
            const endX = startX + 50 + Math.random() * 100
            const endY = startY + Math.random() * 50
            
            await page.mouse.move(startX, startY)
            await page.mouse.down()
            await page.mouse.move(endX, endY)
            await page.mouse.up()
            
            await this.bot.utils.wait(1000 + Math.random() * 2000)
            
            // 点击其他地方取消选择
            await page.mouse.click(50, 50)
            
            this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', '📝 Text selection simulation')
        } catch (error) {
            // 忽略错误
        }
    }

    /**
     * 🎲 工具函数
     */
    private shuffleArray<T>(array: T[]): void {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            const itemI = array[i]
            const itemJ = array[j]
            if (itemI !== undefined && itemJ !== undefined) {
                array[i] = itemJ
                array[j] = itemI
            }
        }
    }

    private getPriorityWeight(priority: string): number {
        switch (priority) {
            case 'high': return 3
            case 'medium': return 2
            case 'low': return 1
            default: return 1
        }
    }

    private getRandomBreakActivity(): string {
        const activities = [
            'coffee_break', 'stretch', 'phone_check', 'bathroom', 'snack', 'email_check'
        ]
        const randomIndex = Math.floor(Math.random() * activities.length)
        return activities[randomIndex] || 'coffee_break'
    }

    private calculateTotalDuration(tasks: (TaskInfo | BreakInfo)[]): number {
        return tasks.reduce((total, task) => {
            const duration = 'duration' in task ? task.duration : { min: 2, max: 5 }
            return total + (duration.min + duration.max) / 2
        }, 0)
    }



    /**
     * 🚀 主要的防检测任务执行器
     */
    public async executeTasksWithUltraAntiDetection(
        workerPage: Page, 
        _data: DashboardData, 
        availableTasks: Array<{ name: string, enabled: boolean, task: () => Promise<void> }>
    ): Promise<void> {
        this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', '🛡️ Starting Ultra Anti-Detection Task Execution')
        
        // 检查是否是最佳活动时间
        if (!this.isOptimalActivityTime()) {
            const delayMinutes = 10 + Math.random() * 20
            this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', `⏰ Suboptimal time detected, delaying ${delayMinutes.toFixed(1)} minutes`)
            await this.bot.utils.wait(delayMinutes * 60 * 1000)
        }
        
        // 生成动态任务执行计划
        const executionPlan = this.generateDynamicTaskOrder()
        this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', `📋 Generated execution plan: ${executionPlan.estimatedDuration.toFixed(1)} minutes estimated`)
        
        let completedTasks = 0
        const totalTasks = executionPlan.tasks.length
        
        for (const planItem of executionPlan.tasks) {
            if ('type' in planItem && planItem.type === 'break') {
                // 执行休息
                const breakDuration = (planItem.duration.min + Math.random() * (planItem.duration.max - planItem.duration.min)) * 60 * 1000
                this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', `☕ Taking break: ${planItem.activity} for ${Math.round(breakDuration/60000)} minutes`)
                await this.simulateSessionInterruption(workerPage)
                continue
            }
            
            const taskItem = planItem as TaskInfo
            const actualTask = availableTasks.find(t => t.name === taskItem.name)
            
            if (!actualTask || !actualTask.enabled) {
                this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', `⏭️ Skipping ${taskItem.name} (disabled or not found)`)
                continue
            }
            
            completedTasks++
            this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', `🎯 [${completedTasks}/${totalTasks}] Starting ${taskItem.name}...`)
            
            try {
                // 任务执行前的多任务模拟
                await this.simulateMultitasking(workerPage, taskItem.name)
                
                // 执行实际任务
                await actualTask.task()
                
                this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', `✅ Completed ${taskItem.name}`)
                
                // 任务间的自然延迟
                if (completedTasks < totalTasks) {
                    const interTaskDelay = 5000 + Math.random() * 15000 // 5-20秒
                    this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', `⏱️ Inter-task delay: ${Math.round(interTaskDelay/1000)}s`)
                    await this.bot.utils.wait(interTaskDelay)
                    
                    // 30%概率模拟中途干扰
                    if (Math.random() < 0.3) {
                        await this.simulateSessionInterruption(workerPage)
                    }
                }
                
            } catch (error) {
                this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', `❌ Failed ${taskItem.name}: ${error}`, 'error')
                
                // 错误后的恢复行为模拟
                await this.bot.utils.wait(2000 + Math.random() * 3000)
            }
        }
        
        this.bot.log(this.bot.isMobile, 'ULTRA-ANTI-DETECTION', '🎉 Ultra Anti-Detection Task Execution Completed')
    }
} 