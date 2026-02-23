//% color=#0fbc11 icon="\uf2c9" weight=100
namespace dht11 {
    const MIN_INTERVAL_MS = 2500
    const LIB_VERSION = "0.0.5"

    let lastReadMs = -999999
    let lastTempC = 0
    let lastHumidity = 0
    let lastOk = false

    let serialInitDone = false
    function initSerialOnce(): void {
        if (serialInitDone) return
        serialInitDone = true
        serial.redirectToUSB()
        serial.writeLine("[dht11] serial debug ON, version=" + LIB_VERSION)
    }
    function dbg(msg: string): void {
        initSerialOnce()
        serial.writeLine("[dht11] " + msg)
    }

    function bytesToHex(data: number[]): string {
        const hex = "0123456789ABCDEF"
        let out = ""
        for (let i = 0; i < data.length; i++) {
            const b = data[i] & 0xff
            out += hex.charAt((b >> 4) & 0xf)
            out += hex.charAt(b & 0xf)
            if (i < data.length - 1) out += " "
        }
        return out
    }

    function readRaw(pin: DigitalPin): boolean {
        initSerialOnce()

        // Pull-up helps even if the module has a resistor
        pins.setPull(pin, PinPullMode.PullUp)

        dbg("line state (idle) =" + pins.digitalReadPin(pin))

        // Idle high
        pins.digitalWritePin(pin, 1)
        basic.pause(80)

        // Start: pull low >=18ms
        pins.digitalWritePin(pin, 0)
        control.waitMicros(50)
        dbg("line state (during LOW) =" + pins.digitalReadPin(pin))
        basic.pause(20)

        // Release: go high, then read to encourage input mode
        pins.digitalWritePin(pin, 1)
        pins.setPull(pin, PinPullMode.PullUp)
        pins.digitalReadPin(pin)
        control.waitMicros(80)

        dbg("line state (after release) =" + pins.digitalReadPin(pin))

        // DHT response: ~80us low then ~80us high
        const respLow = pins.pulseIn(pin, PulseValue.Low, 5000)
        const respHigh = pins.pulseIn(pin, PulseValue.High, 5000)
        dbg(`resp low=${respLow}us high=${respHigh}us`)
        if (respLow == 0 || respHigh == 0) {
            dbg("timeout waiting for response")
            return false
        }

        // Read 40 bits
        const data = [0, 0, 0, 0, 0]
        for (let i = 0; i < 40; i++) {
            const lowLen = pins.pulseIn(pin, PulseValue.Low, 5000)
            const highLen = pins.pulseIn(pin, PulseValue.High, 5000)

            if (lowLen == 0 || highLen == 0) {
                dbg(`bit ${i}: timeout low=${lowLen} high=${highLen}`)
                dbg("line state (at timeout) =" + pins.digitalReadPin(pin))
                return false
            }

            const byteIndex = (i / 8) | 0
            data[byteIndex] = (data[byteIndex] << 1) & 0xff
            const bit = highLen > 50 ? 1 : 0
            data[byteIndex] |= bit

            if (i < 8 || i >= 32) {
                dbg(`bit ${i}: low=${lowLen} high=${highLen} -> ${bit}`)
            }
        }

        const checksum = (data[0] + data[1] + data[2] + data[3]) & 0xff
        dbg("raw bytes: " + bytesToHex(data) + ` | checksum calc=${checksum}`)
        if (data[4] != checksum) {
            dbg(`checksum mismatch: got=${data[4]} expected=${checksum}`)
            return false
        }

        lastHumidity = data[0]
        lastTempC = data[2]
        lastOk = true
        dbg(`OK humidity=${lastHumidity}% temp=${lastTempC}C`)
        return true
    }

    function ensureFresh(pin: DigitalPin): void {
        const now = control.millis()
        if (now - lastReadMs < MIN_INTERVAL_MS && lastOk) return

        dbg(`reading on pin=${pin}...`)
        lastOk = readRaw(pin)
        lastReadMs = now
        if (!lastOk) dbg("read failed")
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
}