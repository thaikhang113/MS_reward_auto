import { Page } from 'playwright'

export class UltimateStealthSystem {
    
    /**
     * 🧠 深度行为序列模拟
     * 基于真实用户行为的统计学模型
     */
    public async simulateRealUserBehaviorSequence(page: Page): Promise<void> {
        // 真实用户的微错误模拟
        const errorPatterns = [
            // 打字错误和修正
            async () => {
                if (Math.random() < 0.15) { // 15%概率出现打字错误
                    const searchBox = page.locator('input[name="q"], #sb_form_q')
                    try {
                        await searchBox.type('tset') // 故意打错
                        await page.waitForTimeout(200 + Math.random() * 300)
                        await page.keyboard.press('Backspace')
                        await page.keyboard.press('Backspace')
                        await page.keyboard.press('Backspace')
                        await page.keyboard.press('Backspace')
                        await page.waitForTimeout(100 + Math.random() * 200)
                        await searchBox.type('test') // 修正
                    } catch (error) {
                        // 忽略错误
                    }
                }
            },
            
            // 搜索犹豫
            async () => {
                if (Math.random() < 0.2) { // 20%概率搜索犹豫
                    const searchBox = page.locator('input[name="q"], #sb_form_q')
                    try {
                        await searchBox.type('how to')
                        await page.waitForTimeout(1000 + Math.random() * 2000) // 思考停顿
                        await searchBox.type(' cook')
                        await page.waitForTimeout(500 + Math.random() * 1000)
                        // 删除重新输入
                        await page.keyboard.press('Control+A')
                        await page.waitForTimeout(200)
                        await searchBox.type('cooking tips')
                    } catch (error) {
                        // 忽略错误
                    }
                }
            },
            
            // 意外点击
            async () => {
                if (Math.random() < 0.1) { // 10%概率意外点击
                    const randomX = 100 + Math.random() * 500
                    const randomY = 100 + Math.random() * 300
                    await page.mouse.click(randomX, randomY)
                    await page.waitForTimeout(500)
                    // 意识到点错了，点击搜索框
                    try {
                        await page.locator('input[name="q"], #sb_form_q').click()
                    } catch (error) {
                        // 忽略错误
                    }
                }
            }
        ]
        
        // 随机执行一个错误模式
        if (Math.random() < 0.3) {
            const randomIndex = Math.floor(Math.random() * errorPatterns.length)
            const pattern = errorPatterns[randomIndex]
            if (pattern) {
                await pattern()
            }
        }
    }

    /**
     * 📱 移动设备传感器数据模拟
     */
    public async injectMobileSensorData(page: Page): Promise<void> {
        await page.addInitScript(() => {
            // 模拟设备方向
            let orientation = Math.random() > 0.7 ? 90 : 0 // 30%概率横屏
            
            // 模拟陀螺仪数据
            const mockDeviceOrientationEvent = () => {
                const event = new DeviceOrientationEvent('deviceorientation', {
                    alpha: Math.random() * 360,
                    beta: -90 + Math.random() * 180,
                    gamma: -90 + Math.random() * 180,
                    absolute: true
                })
                window.dispatchEvent(event)
            }
            
            // 模拟加速度计数据
            const mockDeviceMotionEvent = () => {
                const event = new DeviceMotionEvent('devicemotion', {
                    acceleration: {
                        x: -1 + Math.random() * 2,
                        y: -1 + Math.random() * 2,
                        z: 9.8 + Math.random() * 0.4
                    },
                    accelerationIncludingGravity: {
                        x: -1 + Math.random() * 2,
                        y: -1 + Math.random() * 2,
                        z: 9.8 + Math.random() * 0.4
                    },
                    rotationRate: {
                        alpha: Math.random() * 10,
                        beta: Math.random() * 10,
                        gamma: Math.random() * 10
                    },
                    interval: 16
                })
                window.dispatchEvent(event)
            }
            
            // 定期触发传感器事件
            setInterval(mockDeviceOrientationEvent, 1000 + Math.random() * 2000)
            setInterval(mockDeviceMotionEvent, 100 + Math.random() * 100)
            
            // 模拟设备旋转
            setTimeout(() => {
                if (Math.random() < 0.3) { // 30%概率旋转设备
                    orientation = orientation === 0 ? 90 : 0
                    // 触发orientationchange事件而不是直接修改只读属性
                    window.dispatchEvent(new Event('orientationchange'))
                }
            }, 30000 + Math.random() * 60000) // 30-90秒后
        })
    }

    /**
     * 🎯 深度页面交互模拟
     */
    public async simulateComplexPageInteraction(page: Page): Promise<void> {
        const interactions = [
            // 滚动阅读模式
            async () => {
                // 模拟真实阅读：慢速滚动 + 停顿
                for (let i = 0; i < 3 + Math.random() * 3; i++) {
                    await page.keyboard.press('PageDown')
                    await page.waitForTimeout(2000 + Math.random() * 3000) // 阅读停顿
                    
                    // 30%概率向上回看
                    if (Math.random() < 0.3) {
                        await page.keyboard.press('PageUp')
                        await page.waitForTimeout(1000 + Math.random() * 2000)
                        await page.keyboard.press('PageDown')
                    }
                }
            },
            
            // 鼠标轨迹模拟
            async () => {
                const startX = Math.random() * 800
                const startY = Math.random() * 600
                
                // 模拟人类鼠标移动：不是直线，有停顿
                await page.mouse.move(startX, startY)
                await page.waitForTimeout(100)
                
                for (let i = 0; i < 5; i++) {
                    const targetX = startX + (Math.random() - 0.5) * 200
                    const targetY = startY + (Math.random() - 0.5) * 200
                    
                    // 分步移动，模拟人类轨迹
                    const steps = 3 + Math.random() * 5
                    for (let step = 0; step < steps; step++) {
                        const x = startX + (targetX - startX) * (step / steps)
                        const y = startY + (targetY - startY) * (step / steps)
                        await page.mouse.move(x, y)
                        await page.waitForTimeout(50 + Math.random() * 100)
                    }
                    
                    // 随机停顿
                    await page.waitForTimeout(200 + Math.random() * 800)
                }
            },
            
            // 文本选择和复制
            async () => {
                try {
                    // 随机选择页面文本
                    const elements = await page.$$('p, span, div, h1, h2, h3')
                    if (elements.length > 0) {
                        const randomIndex = Math.floor(Math.random() * elements.length)
                        const element = elements[randomIndex]
                        
                        if (element) {
                            // 双击选择单词
                            await element.dblclick()
                            await page.waitForTimeout(500 + Math.random() * 1000)
                            
                            // 20%概率复制
                            if (Math.random() < 0.2) {
                                await page.keyboard.press('Control+C')
                                await page.waitForTimeout(200)
                            }
                            
                            // 点击其他地方取消选择
                            await page.mouse.click(100, 100)
                        }
                    }
                } catch (error) {
                    // 忽略错误
                }
            }
        ]
        
        // 随机执行1-2个交互
        const numInteractions = 1 + Math.floor(Math.random() * 2)
        for (let i = 0; i < numInteractions; i++) {
            const randomIndex = Math.floor(Math.random() * interactions.length)
            const interaction = interactions[randomIndex]
            if (interaction) {
                await interaction()
                await page.waitForTimeout(1000 + Math.random() * 3000)
            }
        }
    }

    /**
     * 🔬 浏览器环境深度伪装
     */
    public async deepBrowserCamouflage(page: Page): Promise<void> {
        await page.addInitScript(() => {
            // 伪装webdriver属性
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false
            })
            
            // 伪装Chrome对象
            Object.defineProperty(window, 'chrome', {
                get: () => ({
                    runtime: {},
                    loadTimes: function() {
                        return {
                            commitLoadTime: Date.now() / 1000 - Math.random() * 10,
                            connectionInfo: 'http/1.1',
                            finishDocumentLoadTime: Date.now() / 1000 - Math.random() * 5,
                            finishLoadTime: Date.now() / 1000 - Math.random() * 3,
                            firstPaintAfterLoadTime: Date.now() / 1000 - Math.random() * 2,
                            firstPaintTime: Date.now() / 1000 - Math.random() * 8,
                            navigationType: 'Other',
                            numTabsInWindow: 1 + Math.floor(Math.random() * 8),
                            requestTime: Date.now() / 1000 - Math.random() * 15,
                            startLoadTime: Date.now() / 1000 - Math.random() * 12,
                            wasAlternateProtocolAvailable: false,
                            wasFetchedViaSpdy: false,
                            wasNpnNegotiated: false
                        }
                    },
                    csi: function() {
                        return {
                            onloadT: Date.now(),
                            pageT: Math.random() * 1000,
                            startE: Date.now() - Math.random() * 1000,
                            tran: Math.floor(Math.random() * 20)
                        }
                    }
                }),
                configurable: true
            })
            
            // 伪装插件列表
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    {
                        name: 'Chrome PDF Plugin',
                        filename: 'internal-pdf-viewer',
                        description: 'Portable Document Format'
                    },
                    {
                        name: 'Native Client',
                        filename: 'internal-nacl-plugin',
                        description: ''
                    }
                ]
            })
            
            // 伪装语言列表
            Object.defineProperty(navigator, 'languages', {
                get: () => ['ja-JP', 'ja', 'en-US', 'en']
            })
            
            // 伪装内存信息
            Object.defineProperty(navigator, 'deviceMemory', {
                get: () => 4 + Math.floor(Math.random() * 4) // 4-8GB
            })
            
            // 伪装硬件并发
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => 4 + Math.floor(Math.random() * 4) // 4-8核
            })
            
            // 伪装连接信息
            Object.defineProperty(navigator, 'connection', {
                get: () => ({
                    downlink: 10 + Math.random() * 90,
                    effectiveType: '4g',
                    rtt: 50 + Math.random() * 100,
                    saveData: false
                })
            })
        })
    }

    /**
     * 🎭 人类错误模拟系统
     */
    public async simulateHumanErrors(page: Page): Promise<void> {
        const errorTypes = [
            // 输入错误
            async () => {
                const inputs = await page.$$('input[type="text"], input[type="search"], textarea')
                if (inputs.length > 0) {
                    const randomIndex = Math.floor(Math.random() * inputs.length)
                    const input = inputs[randomIndex]
                    
                    if (input) {
                        // 模拟输入错误
                        await input.type('helo') // 故意拼错
                        await page.waitForTimeout(1000)
                        await page.keyboard.press('Backspace')
                        await input.type('lo') // 修正
                    }
                }
            },
            
            // 错误点击
            async () => {
                // 点击非交互元素
                const x = 200 + Math.random() * 400
                const y = 200 + Math.random() * 300
                await page.mouse.click(x, y)
                await page.waitForTimeout(500)
                
                // 意识到点错了，做修正操作
                await page.keyboard.press('Escape')
            },
            
            // 快捷键误操作
            async () => {
                if (Math.random() < 0.1) {
                    // 意外按了Ctrl+R（刷新）
                    await page.keyboard.press('Control+R')
                    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
                }
            },
            
            // 返回键误操作
            async () => {
                if (Math.random() < 0.05) {
                    await page.keyboard.press('Alt+Left') // 意外后退
                    await page.waitForTimeout(1000)
                    await page.keyboard.press('Alt+Right') // 前进回来
                }
            }
        ]
        
        // 5%概率发生人类错误
        if (Math.random() < 0.05) {
            const randomIndex = Math.floor(Math.random() * errorTypes.length)
            const error = errorTypes[randomIndex]
            if (error) {
                await error()
            }
        }
    }

    /**
     * 🌐 网络行为真实化
     */
    public async simulateRealNetworkBehavior(page: Page): Promise<void> {
        // 模拟真实的网络延迟
        await page.route('**/*', async (route) => {
            // 随机延迟 10-100ms
            await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 90))
            await route.continue()
        })
        
        // 模拟偶发的网络错误和重试
        await page.route('**/*.{png,jpg,jpeg,gif,css,js}', async (route) => {
            // 1%概率模拟网络错误
            if (Math.random() < 0.01) {
                await route.abort('internetdisconnected')
                return
            }
            
            // 正常处理
            await route.continue()
        })
    }

    /**
     * 📊 统计学反检测
     */
    public generateImperfectTiming(): number {
        // 人类行为不是完美的高斯分布，而是有偏斜的
        const base = Math.random()
        const skewed = Math.pow(base, 0.7) // 偏向较短时间
        
        // 添加偶发的长延迟（模拟分心）
        if (Math.random() < 0.05) {
            return skewed * 10000 + 15000 // 15-25秒的分心
        }
        
        return skewed * 3000 + 1000 // 1-4秒的正常延迟
    }

    /**
     * 🧪 Canvas指纹噪声注入
     */
    public async injectCanvasNoise(page: Page): Promise<void> {
        await page.addInitScript(() => {
            const originalToDataURL = HTMLCanvasElement.prototype.toDataURL
            
            // 为Canvas添加微小噪声
            HTMLCanvasElement.prototype.toDataURL = function(type?: string, quality?: number) {
                const context = this.getContext('2d')
                if (context) {
                    // 添加不可见的随机像素
                    const imageData = context.getImageData(0, 0, this.width, this.height)
                    const data = imageData.data
                    
                    if (data) {
                        for (let i = 0; i < data.length; i += 4) {
                            if (Math.random() < 0.001) { // 0.1%概率修改像素
                                const currentR = data[i]
                                const currentG = data[i + 1]
                                const currentB = data[i + 2]
                                if (currentR !== undefined && currentG !== undefined && currentB !== undefined) {
                                    data[i] = Math.min(255, currentR + (Math.random() - 0.5) * 2)
                                    data[i + 1] = Math.min(255, currentG + (Math.random() - 0.5) * 2)
                                    data[i + 2] = Math.min(255, currentB + (Math.random() - 0.5) * 2)
                                }
                            }
                        }
                        context.putImageData(imageData, 0, 0)
                    }
                }
                return originalToDataURL.call(this, type, quality)
            }
        })
    }

    /**
     * 🔄 动态User-Agent轮换
     */
    public async rotateUserAgent(page: Page): Promise<void> {
        // 在会话中动态轮换User-Agent（模拟移动设备自动更新）
        if (Math.random() < 0.1) { // 10%概率轮换
            const mobileUAs = [
                'Mozilla/5.0 (Android 13; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0',
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
                'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
            ]
            
            const desktopUAs = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ]
            
            const isMobile = await page.evaluate(() => window.innerWidth < 768)
            const uas = isMobile ? mobileUAs : desktopUAs
            const randomIndex = Math.floor(Math.random() * uas.length)
            const newUA = uas[randomIndex]
            
            if (newUA) {
                await page.setExtraHTTPHeaders({
                    'User-Agent': newUA
                })
            }
        }
    }
} 