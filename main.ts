
//% color=#0fbc11 icon="\uf2c9" weight=100
namespace dht11 {
    const MIN_INTERVAL_MS = 2500

    let lastReadMs = -999999
    let lastTempC = 0
    let lastHumidity = 0
    let lastOk = false

    export enum DhtReading {
        //% block="temperature (°C)"
        TemperatureC = 0,
        //% block="humidity (%)"
        Humidity = 1
    }

    function waitMicros(us: number): void {
        control.waitMicros(us)
    }

    function expectPulse(pin: DigitalPin, level: number, timeoutMicros: number): number {
        let t = 0
        while (pins.digitalReadPin(pin) == level) {
            waitMicros(1)
            t++
            if (t >= timeoutMicros) return -1
        }
        return t
    }

    function readRaw(pin: DigitalPin): boolean {
        pins.digitalWritePin(pin, 1)
        basic.pause(60)

        pins.digitalWritePin(pin, 0)
        basic.pause(20)

        pins.digitalWritePin(pin, 1)
        waitMicros(40)

        if (expectPulse(pin, 0, 300) < 0) return false
        if (expectPulse(pin, 1, 300) < 0) return false

        let data = [0, 0, 0, 0, 0]
        for (let i = 0; i < 40; i++) {
            if (expectPulse(pin, 0, 160) < 0) return false
            const highLen = expectPulse(pin, 1, 260)
            if (highLen < 0) return false

            const byteIndex = (i / 8) | 0
            data[byteIndex] = data[byteIndex] << 1

            if (highLen > 35) data[byteIndex] |= 1
        }

        const checksum = (data[0] + data[1] + data[2] + data[3]) & 0xff
        if (data[4] != checksum) return false

        lastHumidity = data[0]
        lastTempC = data[2]
        lastOk = true
        return true
    }

    function ensureFresh(pin: DigitalPin): void {
        const now = control.millis()
        if (now - lastReadMs < MIN_INTERVAL_MS && lastOk) return

        lastOk = readRaw(pin)
        lastReadMs = now
    }

    //% block="DHT11 temperature (°C) on pin %pin"
    //% pin.fieldEditor="gridpicker" pin.fieldOptions.columns=4
    export function temperatureC(pin: DigitalPin): number {
        ensureFresh(pin)
        return lastOk ? lastTempC : -999
    }

    //% block="DHT11 humidity (%) on pin %pin"
    //% pin.fieldEditor="gridpicker" pin.fieldOptions.columns=4
    export function humidity(pin: DigitalPin): number {
        ensureFresh(pin)
        return lastOk ? lastHumidity : -1
    }

    //% block="DHT11 read %what on pin %pin"
    //% pin.fieldEditor="gridpicker" pin.fieldOptions.columns=4
    export function read(pin: DigitalPin, what: DhtReading): number {
        ensureFresh(pin)
        if (!lastOk) return what == DhtReading.TemperatureC ? -999 : -1
        return what == DhtReading.TemperatureC ? lastTempC : lastHumidity
    }
}
