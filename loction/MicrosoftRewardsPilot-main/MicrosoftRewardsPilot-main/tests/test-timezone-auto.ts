import { GeoLanguageDetector } from '../utils/GeoLanguage'
import { StartupConfig } from '../utils/StartupConfig'

// 定义StartupSummary类型（与StartupConfig中的类型一致）
interface StartupSummaryTimezone {
    current: string
    offset: string
    name: string
    isDST: boolean
    matchesLocation: boolean
    detectedTimezone: string
}

interface StartupSummaryGeolocation {
    country: string
    countryCode: string
    city: string
    language: string
    languageName: string
    ip: string
}

interface StartupSummary {
    timezone: StartupSummaryTimezone
    geolocation: StartupSummaryGeolocation
    recommendations: string[]
}

async function testAutoTimezone() {
    console.log('=== 自动时区检测与设置功能测试 ===\n')

    try {
        // 1. 显示当前时区信息
        console.log('1. 当前时区状态...')
        const timezoneInfo = GeoLanguageDetector.getTimezoneInfo()
        
        console.log('当前时区详细信息:')
        console.log(`  🌍 时区标识: ${timezoneInfo.current}`)
        console.log(`  ⏰ UTC偏移: ${timezoneInfo.offset}`)
        console.log(`  📍 时区名称: ${timezoneInfo.name}`)
        console.log(`  🌅 夏令时状态: ${timezoneInfo.isDST ? '启用' : '未启用'}`)
        console.log('')

        // 2. 检测地理位置和推荐时区
        console.log('2. 地理位置检测与时区匹配分析...')
        const location = await GeoLanguageDetector.getCurrentLocation()
        
        console.log('检测到的地理位置:')
        console.log(`  🗾 国家: ${location.country} (${location.countryCode})`)
        console.log(`  🏙️ 城市: ${location.city}`)
        console.log(`  🌐 推荐时区: ${location.timezone}`)
        console.log(`  📱 IP地址: ${location.ip}`)
        console.log('')

        // 3. 时区匹配检查
        console.log('3. 时区地理位置匹配检查...')
        const timezoneMatch = await GeoLanguageDetector.checkTimezoneLocationMatch()
        
        const matchStatus = timezoneMatch.isMatched ? '✅ 完美匹配' : '❌ 需要调整'
        console.log(`  📊 匹配状态: ${matchStatus}`)
        console.log(`  🔄 当前时区: ${timezoneMatch.currentTimezone}`)
        console.log(`  🎯 检测时区: ${timezoneMatch.detectedTimezone}`)
        console.log(`  💡 专家建议: ${timezoneMatch.recommendation}`)
        console.log('')

        // 4. 模拟自动时区设置（仅在不匹配时）
        if (!timezoneMatch.isMatched) {
            console.log('4. 自动时区设置模拟...')
            console.log('⚠️  检测到时区与地理位置不匹配')
            console.log(`🔄 建议切换: ${timezoneMatch.currentTimezone} → ${timezoneMatch.detectedTimezone}`)
            console.log('')
            
            console.log('模拟自动设置过程:')
            console.log('  1️⃣ 验证目标时区有效性...')
            const isValidTimezone = GeoLanguageDetector['isValidTimezone'](timezoneMatch.detectedTimezone)
            console.log(`     结果: ${isValidTimezone ? '✅ 有效' : '❌ 无效'}`)
            
            if (isValidTimezone) {
                console.log('  2️⃣ 设置环境变量 TZ...')
                console.log(`     TZ=${timezoneMatch.detectedTimezone}`)
                
                console.log('  3️⃣ 验证设置结果...')
                console.log('     检查 Intl.DateTimeFormat().resolvedOptions().timeZone')
                
                console.log('  4️⃣ 记录设置日志...')
                console.log(`     [TIMEZONE-AUTO] Successfully switched to ${timezoneMatch.detectedTimezone}`)
            }
            console.log('')
        } else {
            console.log('4. 时区状态检查结果...')
            console.log('✅ 当前时区已与地理位置完美匹配，无需调整')
            console.log('')
        }

        // 5. 启动配置测试
        console.log('5. 启动配置系统测试...')
        console.log('模拟程序启动时的自动配置初始化...')
        
        const startupSummary: StartupSummary = await StartupConfig.getStartupSummary()
        
        console.log('启动配置摘要:')
        console.log('  时区配置:')
        console.log(`    当前: ${startupSummary.timezone.current} (${startupSummary.timezone.offset})`)
        console.log(`    名称: ${startupSummary.timezone.name}`)
        console.log(`    匹配状态: ${startupSummary.timezone.matchesLocation ? '✅' : '❌'}`)
        
        console.log('  地理位置:')
        console.log(`    位置: ${startupSummary.geolocation.country}, ${startupSummary.geolocation.city}`)
        console.log(`    语言: ${startupSummary.geolocation.languageName} (${startupSummary.geolocation.language})`)
        
        if (startupSummary.recommendations.length > 0) {
            console.log('  配置建议:')
            startupSummary.recommendations.forEach((rec, index) => {
                console.log(`    ${index + 1}. ${rec}`)
            })
        }
        console.log('')

        // 6. 配置验证
        console.log('6. 配置文件验证...')
        const configValidation = StartupConfig.validateConfiguration()
        
        console.log(`配置有效性: ${configValidation.isValid ? '✅ 有效' : '❌ 有问题'}`)
        
        if (configValidation.issues.length > 0) {
            console.log('发现的问题:')
            configValidation.issues.forEach((issue, index) => {
                console.log(`  ❌ ${index + 1}. ${issue}`)
            })
        }
        
        if (configValidation.suggestions.length > 0) {
            console.log('优化建议:')
            configValidation.suggestions.forEach((suggestion, index) => {
                console.log(`  💡 ${index + 1}. ${suggestion}`)
            })
        }
        console.log('')

        // 7. 最终建议
        console.log('7. 综合建议与下一步操作...')
        
        if (!timezoneMatch.isMatched) {
            console.log('🔧 时区优化建议:')
            console.log('   • 在 config.json 中启用 autoTimezone.enabled: true')
            console.log('   • 启用 autoTimezone.setOnStartup: true 实现启动时自动调整')
            console.log('   • 启用 autoTimezone.logChanges: true 记录时区变更日志')
        }
        
        console.log('🚀 反检测增强效果:')
        console.log('   • 时区与地理位置完全匹配，提升搜索行为真实性')
        console.log('   • 本地化搜索查询配合正确时区，模拟真实用户习惯')
        console.log('   • 大幅降低 Microsoft 检测系统的怀疑度')
        
        console.log('\n📋 推荐配置:')
        console.log(JSON.stringify({
            searchSettings: {
                autoTimezone: {
                    enabled: true,
                    setOnStartup: true,
                    validateMatch: true,
                    logChanges: true
                },
                multiLanguage: {
                    enabled: true,
                    autoDetectLocation: true,
                    fallbackLanguage: location.language || 'en'
                }
            }
        }, null, 2))

    } catch (error) {
        console.error('❌ 测试过程中发生错误:', error)
        
        console.log('\n备用方案信息:')
        console.log('如果地理检测失败，系统将:')
        console.log('  1. 使用当前系统时区作为备用')
        console.log('  2. 根据时区推测地理位置')
        console.log('  3. 选择对应的本地化语言配置')
        console.log('  4. 确保程序正常运行')
    }

    console.log('\n=== 自动时区测试完成 ===')
    console.log('🎯 这个功能将使您的 Microsoft Rewards 脚本：')
    console.log('   • 时区与IP地理位置完美匹配')
    console.log('   • 搜索时间与当地作息习惯一致')
    console.log('   • 大幅提升反检测能力')
    console.log('   • 实现真正的本地化体验')
}

// 运行测试
testAutoTimezone().catch(error => {
    console.error('自动时区测试失败:', error)
    process.exit(1)
}) 