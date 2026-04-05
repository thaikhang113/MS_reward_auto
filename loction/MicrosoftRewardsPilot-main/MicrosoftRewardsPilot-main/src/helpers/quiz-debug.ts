#!/usr/bin/env node

import { chromium, Page } from 'rebrowser-playwright'
import { load, CheerioAPI } from 'cheerio'

/**
 * Quiz页面结构调试脚本
 * 用于分析Microsoft Rewards Quiz页面的DOM结构变化
 */

class QuizPageAnalyzer {
    
    /**
     * 分析Quiz页面结构
     */
    async analyzeQuizPage(url: string): Promise<void> {
        console.log(`🔍 正在分析Quiz页面: ${url}`)
        console.log('='.repeat(60))
        
        const browser = await chromium.launch({ 
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        })
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        
        const page = await context.newPage()
        
        try {
            await page.goto(url, { waitUntil: 'networkidle' })
            await page.waitForTimeout(3000)
            
            const title = await page.title()
            console.log(`📄 页面标题: ${title}`)
            console.log(`🔗 当前URL: ${page.url()}`)
            
            // 获取页面源码
            const html = await page.content()
            const $ = load(html)
            
            // 1. 分析Script中的Quiz数据
            console.log('\n📊 分析Script中的Quiz数据:')
            this.analyzeScriptData($)
            
            // 2. 分析DOM元素
            console.log('\n🎯 分析关键DOM元素:')
            await this.analyzeDOMElements(page)
            
            // 3. 分析页面结构
            console.log('\n📋 页面结构分析:')
            this.analyzePageStructure($)
            
            // 4. 生成适配建议
            console.log('\n💡 Quiz页面适配建议:')
            await this.generateSuggestions(page, $)
            
        } catch (error) {
            console.error(`❌ 分析过程中出错: ${error}`)
        } finally {
            await browser.close()
        }
    }
    
    /**
     * 分析Script中的Quiz数据
     */
         private analyzeScriptData($: CheerioAPI): void {
        const scriptPatterns = [
            { name: '_w.rewardsQuizRenderInfo', keyword: '_w.rewardsQuizRenderInfo' },
            { name: 'rewardsQuizRenderInfo', keyword: 'rewardsQuizRenderInfo' },
            { name: 'window.rewardsQuizRenderInfo', keyword: 'window.rewardsQuizRenderInfo' },
            { name: 'Microsoft.Rewards.Quiz', keyword: 'Microsoft.Rewards.Quiz' },
            { name: 'quiz_data', keyword: 'quiz_data' },
            { name: 'quizData', keyword: 'quizData' }
        ]
        
        let foundDataSource = false
        
        $('script').each((_, script) => {
            const content = $(script).text()
            if (content.length > 100) { // 只检查有实际内容的script
                for (const pattern of scriptPatterns) {
                    if (content.includes(pattern.keyword)) {
                        console.log(`  ✅ 找到数据源: ${pattern.name}`)
                        console.log(`     Script长度: ${content.length} 字符`)
                        
                        // 尝试提取JSON数据
                        const jsonMatch = content.match(/({[^{}]*quiz[^{}]*})/i)
                        if (jsonMatch) {
                            console.log('     包含Quiz相关JSON数据')
                        }
                        foundDataSource = true
                    }
                }
            }
        })
        
        if (!foundDataSource) {
            console.log('  ❌ 未找到任何已知的Quiz数据源')
            console.log('  🔍 可能的原因:')
            console.log('     - 页面结构已更新，使用新的数据源名称')
            console.log('     - 数据通过AJAX异步加载')
            console.log('     - 数据存储在不同的JavaScript变量中')
        }
    }
    
    /**
     * 分析DOM元素
     */
    private async analyzeDOMElements(page: Page): Promise<void> {
        const keySelectors = [
            { name: 'Quiz开始按钮', selector: '#rqStartQuiz' },
            { name: '答案选项0', selector: '#rqAnswerOption0' },
            { name: '答案选项1', selector: '#rqAnswerOption1' },
            { name: '答案选项2', selector: '#rqAnswerOption2' },
            { name: '答案选项3', selector: '#rqAnswerOption3' },
            { name: '积分显示', selector: '.rqMCredits, span.rqMCredits' },
            { name: '完成容器', selector: '#quizCompleteContainer' }
        ]
        
        for (const item of keySelectors) {
            try {
                const element = await page.waitForSelector(item.selector, { timeout: 1000 }).catch(() => null)
                if (element) {
                    const isVisible = await element.isVisible().catch(() => false)
                    const text = await element.textContent().catch(() => '') || ''
                    console.log(`  ✅ ${item.name}: 找到 (可见: ${isVisible})`)
                    if (text.trim()) {
                        console.log(`     内容: "${text.trim().substring(0, 50)}..."`)
                    }
                } else {
                    console.log(`  ❌ ${item.name}: 未找到 - ${item.selector}`)
                }
            } catch (error) {
                console.log(`  ⚠️  ${item.name}: 检查时出错`)
            }
        }
    }
    
    /**
     * 分析页面结构
     */
         private analyzePageStructure($: CheerioAPI): void {
        console.log(`  📜 Script标签数量: ${$('script').length}`)
        console.log(`  🎨 CSS样式表数量: ${$('link[rel="stylesheet"]').length}`)
        
        // 查找可能的新Quiz元素
        const possibleQuizSelectors = [
            '[data-testid*="quiz"]',
            '[class*="quiz"]',
            '[id*="quiz"]',
            '[data-testid*="answer"]',
            '[class*="answer"]',
            '[id*="answer"]'
        ]
        
        console.log('  🔍 发现的可能Quiz相关元素:')
        for (const selector of possibleQuizSelectors) {
            const elements = $(selector)
            if (elements.length > 0) {
                console.log(`     ${selector}: ${elements.length} 个元素`)
            }
        }
    }
    
    /**
     * 生成适配建议
     */
         private async generateSuggestions(page: Page, $: CheerioAPI): Promise<void> {
        const suggestions = []
        
        // 检查数据获取方法
        const hasScriptData = $('script').text().includes('rewardsQuizRenderInfo') || 
                             $('script').text().includes('quiz')
        
        if (!hasScriptData) {
            suggestions.push('1. 📡 更新数据获取方法:')
            suggestions.push('   - 检查Network面板，查看是否有新的API端点')
            suggestions.push('   - 使用page.evaluate()直接获取JavaScript变量')
            suggestions.push('   - 监听页面的XHR请求获取Quiz数据')
        }
        
        // 检查元素选择器
        const startButton = await page.waitForSelector('#rqStartQuiz', { timeout: 1000 }).catch(() => null)
        if (!startButton) {
            suggestions.push('2. 🎯 更新元素选择器:')
            suggestions.push('   - Quiz开始按钮选择器需要更新')
            suggestions.push('   - 查找新的按钮class或data-testid属性')
        }
        
        const answerOptions = await page.waitForSelector('#rqAnswerOption0', { timeout: 1000 }).catch(() => null)
        if (!answerOptions) {
            suggestions.push('3. ✅ 更新答案选择器:')
            suggestions.push('   - 答案选项选择器需要更新')
            suggestions.push('   - 可能改用data-*属性或新的class名称')
        }
        
        // 提供通用建议
        suggestions.push('4. 🔧 通用适配策略:')
        suggestions.push('   - 使用更灵活的选择器组合 (ID + class + data-*)')
        suggestions.push('   - 添加元素存在性检查和超时处理')
        suggestions.push('   - 实现多种数据获取方法的fallback机制')
        
        suggestions.forEach(suggestion => console.log(suggestion))
        
        // 保存调试信息
        const debugInfo = {
            url: page.url(),
            timestamp: new Date().toISOString(),
            pageTitle: await page.title(),
            hasScriptQuizData: hasScriptData,
            foundElements: {
                startButton: !!startButton,
                answerOptions: !!answerOptions
            }
        }
        
        // 写入调试文件
        try {
            const fs = await import('fs/promises')
            await fs.writeFile('quiz-debug-info.json', JSON.stringify(debugInfo, null, 2))
            console.log('\n💾 调试信息已保存到: quiz-debug-info.json')
        } catch (error) {
            console.log('\n⚠️  无法保存调试信息文件')
        }
    }
}

// 主函数
async function main() {
    const analyzer = new QuizPageAnalyzer()
    
    const testUrl = process.argv[2]
    
    if (!testUrl) {
        console.log('❌ 请提供Quiz页面URL')
        console.log('使用方法: npm run debug-quiz <Quiz页面URL>')
        console.log('示例: npm run debug-quiz "https://rewards.microsoft.com/quiz/..."')
        process.exit(1)
    }
    
    try {
        await analyzer.analyzeQuizPage(testUrl)
        console.log('\n✅ Quiz页面分析完成!')
        
    } catch (error) {
        console.error(`❌ 分析失败: ${error}`)
        process.exit(1)
    }
}

if (require.main === module) {
    main()
} 