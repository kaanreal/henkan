const fs = require('fs');

function checkMp3(filePath) {
    const buffer = fs.readFileSync(filePath);
    let isVbr = false;
    const scanSize = Math.min(buffer.length, 8192);
    for (let i = 0; i < scanSize - 4; i++) {
        const str = buffer.toString('utf8', i, i + 4);
        if (str === 'Xing' || str === 'Info') {
            isVbr = true;
            console.log(`Found ${str} at offset ${i}`);
            break;
        }
    }
    console.log(`${filePath.split('\\\\').pop()}: VBR=${isVbr}`);
}

checkMp3("C:\\\\STUFF\\\\osu!\\\\Songs\\\\2417034 Various Artists - Anto's High BPM Dense Chordjack Pack 25\\\\decode 1.7.mp3");
checkMp3("C:\\\\STUFF\\\\osu!\\\\Songs\\\\2566370 laura les - Haunted (dive to the heart remix)\\\\audio.mp3");
