export class TwoFactorAuthRequiredError extends Error {
    constructor(message: string = '2FA authentication required') {
        super(message)
        this.name = 'TwoFactorAuthRequiredError'
    }
}

export class AccountLockedError extends Error {
    constructor(message: string = 'Account is locked') {
        super(message)
        this.name = 'AccountLockedError'
    }
}

export class LoginTimeoutError extends Error {
    constructor(message: string = 'Login timeout') {
        super(message)
        this.name = 'LoginTimeoutError'
    }
} 