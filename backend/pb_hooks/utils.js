/// <reference path="../pb_data/types.d.ts" />


module.exports = {
    bodyToJson: (body) => {
        let str = ""
        for (const chunk of body) {
            str += String.fromCharCode(chunk)
        }
        return JSON.parse(str)
    }
}