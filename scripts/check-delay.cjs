const fs = require('fs');

function parseXingInfo(filePath) {
    const buffer = fs.readFileSync(filePath);
    let offset = -1;
    let isXing = false;
    for (let i = 0; i < Math.min(buffer.length, 8192) - 4; i++) {
        const str = buffer.toString('utf8', i, i + 4);
        if (str === 'Xing' || str === 'Info') {
            offset = i;
            isXing = str === 'Xing';
            break;
        }
    }
    if (offset === -1) {
        console.log(`${filePath.split('\\\\').pop()}: No Xing/Info`);
        return;
    }
    
    // Xing header format:
    // 4 bytes 'Xing' or 'Info'
    // 4 bytes flags
    const flags = buffer.readUInt32BE(offset + 4);
    let currentOffset = offset + 8;
    if (flags & 1) currentOffset += 4; // frames
    if (flags & 2) currentOffset += 4; // bytes
    if (flags & 4) currentOffset += 100; // toc
    if (flags & 8) currentOffset += 4; // vbr scale
    
    // After Xing/Info header, LAME tag might be present (starts with 'LAME' or 'Lavf' etc)
    const encoderStr = buffer.toString('utf8', currentOffset, currentOffset + 4);
    if (encoderStr === 'LAME' || encoderStr === 'Lavf') {
        // LAME tag format has encoder delay/padding at offset + 21 from start of LAME tag
        // Actually, it's 21 bytes from the 'LAME' string
        const encDelayPad = buffer.readUInt16BE(currentOffset + 21);
        const delay = encDelayPad >> 4;
        const padding = encDelayPad & 0x0FFF;
        console.log(`${filePath.split('\\\\').pop()}: ${encoderStr}, Delay=${delay} samples, Padding=${padding} samples`);
    } else {
        console.log(`${filePath.split('\\\\').pop()}: No LAME tag found at expected offset. Str: ${encoderStr}`);
    }
}

parseXingInfo("C:\\\\STUFF\\\\osu!\\\\Songs\\\\2417034 Various Artists - Anto's High BPM Dense Chordjack Pack 25\\\\decode 1.7.mp3");
parseXingInfo("C:\\\\STUFF\\\\osu!\\\\Songs\\\\2566370 laura les - Haunted (dive to the heart remix)\\\\audio.mp3");
