var date;
var hasRequiredDate;
function requireDate() {
  if (hasRequiredDate) return date;
  hasRequiredDate = 1;
  function parseHttpDate(date2) {
    switch (date2[3]) {
      case ",":
        return parseImfDate(date2);
      case " ":
        return parseAscTimeDate(date2);
      default:
        return parseRfc850Date(date2);
    }
  }
  function parseImfDate(date2) {
    if (date2.length !== 29 || date2[4] !== " " || date2[7] !== " " || date2[11] !== " " || date2[16] !== " " || date2[19] !== ":" || date2[22] !== ":" || date2[25] !== " " || date2[26] !== "G" || date2[27] !== "M" || date2[28] !== "T") {
      return void 0;
    }
    let weekday = -1;
    if (date2[0] === "S" && date2[1] === "u" && date2[2] === "n") {
      weekday = 0;
    } else if (date2[0] === "M" && date2[1] === "o" && date2[2] === "n") {
      weekday = 1;
    } else if (date2[0] === "T" && date2[1] === "u" && date2[2] === "e") {
      weekday = 2;
    } else if (date2[0] === "W" && date2[1] === "e" && date2[2] === "d") {
      weekday = 3;
    } else if (date2[0] === "T" && date2[1] === "h" && date2[2] === "u") {
      weekday = 4;
    } else if (date2[0] === "F" && date2[1] === "r" && date2[2] === "i") {
      weekday = 5;
    } else if (date2[0] === "S" && date2[1] === "a" && date2[2] === "t") {
      weekday = 6;
    } else {
      return void 0;
    }
    let day = 0;
    if (date2[5] === "0") {
      const code = date2.charCodeAt(6);
      if (code < 49 || code > 57) {
        return void 0;
      }
      day = code - 48;
    } else {
      const code1 = date2.charCodeAt(5);
      if (code1 < 49 || code1 > 51) {
        return void 0;
      }
      const code2 = date2.charCodeAt(6);
      if (code2 < 48 || code2 > 57) {
        return void 0;
      }
      day = (code1 - 48) * 10 + (code2 - 48);
    }
    let monthIdx = -1;
    if (date2[8] === "J" && date2[9] === "a" && date2[10] === "n") {
      monthIdx = 0;
    } else if (date2[8] === "F" && date2[9] === "e" && date2[10] === "b") {
      monthIdx = 1;
    } else if (date2[8] === "M" && date2[9] === "a") {
      if (date2[10] === "r") {
        monthIdx = 2;
      } else if (date2[10] === "y") {
        monthIdx = 4;
      } else {
        return void 0;
      }
    } else if (date2[8] === "J") {
      if (date2[9] === "a" && date2[10] === "n") {
        monthIdx = 0;
      } else if (date2[9] === "u") {
        if (date2[10] === "n") {
          monthIdx = 5;
        } else if (date2[10] === "l") {
          monthIdx = 6;
        } else {
          return void 0;
        }
      } else {
        return void 0;
      }
    } else if (date2[8] === "A") {
      if (date2[9] === "p" && date2[10] === "r") {
        monthIdx = 3;
      } else if (date2[9] === "u" && date2[10] === "g") {
        monthIdx = 7;
      } else {
        return void 0;
      }
    } else if (date2[8] === "S" && date2[9] === "e" && date2[10] === "p") {
      monthIdx = 8;
    } else if (date2[8] === "O" && date2[9] === "c" && date2[10] === "t") {
      monthIdx = 9;
    } else if (date2[8] === "N" && date2[9] === "o" && date2[10] === "v") {
      monthIdx = 10;
    } else if (date2[8] === "D" && date2[9] === "e" && date2[10] === "c") {
      monthIdx = 11;
    } else {
      return void 0;
    }
    const yearDigit1 = date2.charCodeAt(12);
    if (yearDigit1 < 48 || yearDigit1 > 57) {
      return void 0;
    }
    const yearDigit2 = date2.charCodeAt(13);
    if (yearDigit2 < 48 || yearDigit2 > 57) {
      return void 0;
    }
    const yearDigit3 = date2.charCodeAt(14);
    if (yearDigit3 < 48 || yearDigit3 > 57) {
      return void 0;
    }
    const yearDigit4 = date2.charCodeAt(15);
    if (yearDigit4 < 48 || yearDigit4 > 57) {
      return void 0;
    }
    const year = (yearDigit1 - 48) * 1e3 + (yearDigit2 - 48) * 100 + (yearDigit3 - 48) * 10 + (yearDigit4 - 48);
    let hour = 0;
    if (date2[17] === "0") {
      const code = date2.charCodeAt(18);
      if (code < 48 || code > 57) {
        return void 0;
      }
      hour = code - 48;
    } else {
      const code1 = date2.charCodeAt(17);
      if (code1 < 48 || code1 > 50) {
        return void 0;
      }
      const code2 = date2.charCodeAt(18);
      if (code2 < 48 || code2 > 57) {
        return void 0;
      }
      if (code1 === 50 && code2 > 51) {
        return void 0;
      }
      hour = (code1 - 48) * 10 + (code2 - 48);
    }
    let minute = 0;
    if (date2[20] === "0") {
      const code = date2.charCodeAt(21);
      if (code < 48 || code > 57) {
        return void 0;
      }
      minute = code - 48;
    } else {
      const code1 = date2.charCodeAt(20);
      if (code1 < 48 || code1 > 53) {
        return void 0;
      }
      const code2 = date2.charCodeAt(21);
      if (code2 < 48 || code2 > 57) {
        return void 0;
      }
      minute = (code1 - 48) * 10 + (code2 - 48);
    }
    let second = 0;
    if (date2[23] === "0") {
      const code = date2.charCodeAt(24);
      if (code < 48 || code > 57) {
        return void 0;
      }
      second = code - 48;
    } else {
      const code1 = date2.charCodeAt(23);
      if (code1 < 48 || code1 > 53) {
        return void 0;
      }
      const code2 = date2.charCodeAt(24);
      if (code2 < 48 || code2 > 57) {
        return void 0;
      }
      second = (code1 - 48) * 10 + (code2 - 48);
    }
    const result = new Date(Date.UTC(year, monthIdx, day, hour, minute, second));
    return result.getUTCDay() === weekday ? result : void 0;
  }
  function parseAscTimeDate(date2) {
    if (date2.length !== 24 || date2[7] !== " " || date2[10] !== " " || date2[19] !== " ") {
      return void 0;
    }
    let weekday = -1;
    if (date2[0] === "S" && date2[1] === "u" && date2[2] === "n") {
      weekday = 0;
    } else if (date2[0] === "M" && date2[1] === "o" && date2[2] === "n") {
      weekday = 1;
    } else if (date2[0] === "T" && date2[1] === "u" && date2[2] === "e") {
      weekday = 2;
    } else if (date2[0] === "W" && date2[1] === "e" && date2[2] === "d") {
      weekday = 3;
    } else if (date2[0] === "T" && date2[1] === "h" && date2[2] === "u") {
      weekday = 4;
    } else if (date2[0] === "F" && date2[1] === "r" && date2[2] === "i") {
      weekday = 5;
    } else if (date2[0] === "S" && date2[1] === "a" && date2[2] === "t") {
      weekday = 6;
    } else {
      return void 0;
    }
    let monthIdx = -1;
    if (date2[4] === "J" && date2[5] === "a" && date2[6] === "n") {
      monthIdx = 0;
    } else if (date2[4] === "F" && date2[5] === "e" && date2[6] === "b") {
      monthIdx = 1;
    } else if (date2[4] === "M" && date2[5] === "a") {
      if (date2[6] === "r") {
        monthIdx = 2;
      } else if (date2[6] === "y") {
        monthIdx = 4;
      } else {
        return void 0;
      }
    } else if (date2[4] === "J") {
      if (date2[5] === "a" && date2[6] === "n") {
        monthIdx = 0;
      } else if (date2[5] === "u") {
        if (date2[6] === "n") {
          monthIdx = 5;
        } else if (date2[6] === "l") {
          monthIdx = 6;
        } else {
          return void 0;
        }
      } else {
        return void 0;
      }
    } else if (date2[4] === "A") {
      if (date2[5] === "p" && date2[6] === "r") {
        monthIdx = 3;
      } else if (date2[5] === "u" && date2[6] === "g") {
        monthIdx = 7;
      } else {
        return void 0;
      }
    } else if (date2[4] === "S" && date2[5] === "e" && date2[6] === "p") {
      monthIdx = 8;
    } else if (date2[4] === "O" && date2[5] === "c" && date2[6] === "t") {
      monthIdx = 9;
    } else if (date2[4] === "N" && date2[5] === "o" && date2[6] === "v") {
      monthIdx = 10;
    } else if (date2[4] === "D" && date2[5] === "e" && date2[6] === "c") {
      monthIdx = 11;
    } else {
      return void 0;
    }
    let day = 0;
    if (date2[8] === " ") {
      const code = date2.charCodeAt(9);
      if (code < 49 || code > 57) {
        return void 0;
      }
      day = code - 48;
    } else {
      const code1 = date2.charCodeAt(8);
      if (code1 < 49 || code1 > 51) {
        return void 0;
      }
      const code2 = date2.charCodeAt(9);
      if (code2 < 48 || code2 > 57) {
        return void 0;
      }
      day = (code1 - 48) * 10 + (code2 - 48);
    }
    let hour = 0;
    if (date2[11] === "0") {
      const code = date2.charCodeAt(12);
      if (code < 48 || code > 57) {
        return void 0;
      }
      hour = code - 48;
    } else {
      const code1 = date2.charCodeAt(11);
      if (code1 < 48 || code1 > 50) {
        return void 0;
      }
      const code2 = date2.charCodeAt(12);
      if (code2 < 48 || code2 > 57) {
        return void 0;
      }
      if (code1 === 50 && code2 > 51) {
        return void 0;
      }
      hour = (code1 - 48) * 10 + (code2 - 48);
    }
    let minute = 0;
    if (date2[14] === "0") {
      const code = date2.charCodeAt(15);
      if (code < 48 || code > 57) {
        return void 0;
      }
      minute = code - 48;
    } else {
      const code1 = date2.charCodeAt(14);
      if (code1 < 48 || code1 > 53) {
        return void 0;
      }
      const code2 = date2.charCodeAt(15);
      if (code2 < 48 || code2 > 57) {
        return void 0;
      }
      minute = (code1 - 48) * 10 + (code2 - 48);
    }
    let second = 0;
    if (date2[17] === "0") {
      const code = date2.charCodeAt(18);
      if (code < 48 || code > 57) {
        return void 0;
      }
      second = code - 48;
    } else {
      const code1 = date2.charCodeAt(17);
      if (code1 < 48 || code1 > 53) {
        return void 0;
      }
      const code2 = date2.charCodeAt(18);
      if (code2 < 48 || code2 > 57) {
        return void 0;
      }
      second = (code1 - 48) * 10 + (code2 - 48);
    }
    const yearDigit1 = date2.charCodeAt(20);
    if (yearDigit1 < 48 || yearDigit1 > 57) {
      return void 0;
    }
    const yearDigit2 = date2.charCodeAt(21);
    if (yearDigit2 < 48 || yearDigit2 > 57) {
      return void 0;
    }
    const yearDigit3 = date2.charCodeAt(22);
    if (yearDigit3 < 48 || yearDigit3 > 57) {
      return void 0;
    }
    const yearDigit4 = date2.charCodeAt(23);
    if (yearDigit4 < 48 || yearDigit4 > 57) {
      return void 0;
    }
    const year = (yearDigit1 - 48) * 1e3 + (yearDigit2 - 48) * 100 + (yearDigit3 - 48) * 10 + (yearDigit4 - 48);
    const result = new Date(Date.UTC(year, monthIdx, day, hour, minute, second));
    return result.getUTCDay() === weekday ? result : void 0;
  }
  function parseRfc850Date(date2) {
    let commaIndex = -1;
    let weekday = -1;
    if (date2[0] === "S") {
      if (date2[1] === "u" && date2[2] === "n" && date2[3] === "d" && date2[4] === "a" && date2[5] === "y") {
        weekday = 0;
        commaIndex = 6;
      } else if (date2[1] === "a" && date2[2] === "t" && date2[3] === "u" && date2[4] === "r" && date2[5] === "d" && date2[6] === "a" && date2[7] === "y") {
        weekday = 6;
        commaIndex = 8;
      }
    } else if (date2[0] === "M" && date2[1] === "o" && date2[2] === "n" && date2[3] === "d" && date2[4] === "a" && date2[5] === "y") {
      weekday = 1;
      commaIndex = 6;
    } else if (date2[0] === "T") {
      if (date2[1] === "u" && date2[2] === "e" && date2[3] === "s" && date2[4] === "d" && date2[5] === "a" && date2[6] === "y") {
        weekday = 2;
        commaIndex = 7;
      } else if (date2[1] === "h" && date2[2] === "u" && date2[3] === "r" && date2[4] === "s" && date2[5] === "d" && date2[6] === "a" && date2[7] === "y") {
        weekday = 4;
        commaIndex = 8;
      }
    } else if (date2[0] === "W" && date2[1] === "e" && date2[2] === "d" && date2[3] === "n" && date2[4] === "e" && date2[5] === "s" && date2[6] === "d" && date2[7] === "a" && date2[8] === "y") {
      weekday = 3;
      commaIndex = 9;
    } else if (date2[0] === "F" && date2[1] === "r" && date2[2] === "i" && date2[3] === "d" && date2[4] === "a" && date2[5] === "y") {
      weekday = 5;
      commaIndex = 6;
    } else {
      return void 0;
    }
    if (date2[commaIndex] !== "," || date2.length - commaIndex - 1 !== 23 || date2[commaIndex + 1] !== " " || date2[commaIndex + 4] !== "-" || date2[commaIndex + 8] !== "-" || date2[commaIndex + 11] !== " " || date2[commaIndex + 14] !== ":" || date2[commaIndex + 17] !== ":" || date2[commaIndex + 20] !== " " || date2[commaIndex + 21] !== "G" || date2[commaIndex + 22] !== "M" || date2[commaIndex + 23] !== "T") {
      return void 0;
    }
    let day = 0;
    if (date2[commaIndex + 2] === "0") {
      const code = date2.charCodeAt(commaIndex + 3);
      if (code < 49 || code > 57) {
        return void 0;
      }
      day = code - 48;
    } else {
      const code1 = date2.charCodeAt(commaIndex + 2);
      if (code1 < 49 || code1 > 51) {
        return void 0;
      }
      const code2 = date2.charCodeAt(commaIndex + 3);
      if (code2 < 48 || code2 > 57) {
        return void 0;
      }
      day = (code1 - 48) * 10 + (code2 - 48);
    }
    let monthIdx = -1;
    if (date2[commaIndex + 5] === "J" && date2[commaIndex + 6] === "a" && date2[commaIndex + 7] === "n") {
      monthIdx = 0;
    } else if (date2[commaIndex + 5] === "F" && date2[commaIndex + 6] === "e" && date2[commaIndex + 7] === "b") {
      monthIdx = 1;
    } else if (date2[commaIndex + 5] === "M" && date2[commaIndex + 6] === "a" && date2[commaIndex + 7] === "r") {
      monthIdx = 2;
    } else if (date2[commaIndex + 5] === "A" && date2[commaIndex + 6] === "p" && date2[commaIndex + 7] === "r") {
      monthIdx = 3;
    } else if (date2[commaIndex + 5] === "M" && date2[commaIndex + 6] === "a" && date2[commaIndex + 7] === "y") {
      monthIdx = 4;
    } else if (date2[commaIndex + 5] === "J" && date2[commaIndex + 6] === "u" && date2[commaIndex + 7] === "n") {
      monthIdx = 5;
    } else if (date2[commaIndex + 5] === "J" && date2[commaIndex + 6] === "u" && date2[commaIndex + 7] === "l") {
      monthIdx = 6;
    } else if (date2[commaIndex + 5] === "A" && date2[commaIndex + 6] === "u" && date2[commaIndex + 7] === "g") {
      monthIdx = 7;
    } else if (date2[commaIndex + 5] === "S" && date2[commaIndex + 6] === "e" && date2[commaIndex + 7] === "p") {
      monthIdx = 8;
    } else if (date2[commaIndex + 5] === "O" && date2[commaIndex + 6] === "c" && date2[commaIndex + 7] === "t") {
      monthIdx = 9;
    } else if (date2[commaIndex + 5] === "N" && date2[commaIndex + 6] === "o" && date2[commaIndex + 7] === "v") {
      monthIdx = 10;
    } else if (date2[commaIndex + 5] === "D" && date2[commaIndex + 6] === "e" && date2[commaIndex + 7] === "c") {
      monthIdx = 11;
    } else {
      return void 0;
    }
    const yearDigit1 = date2.charCodeAt(commaIndex + 9);
    if (yearDigit1 < 48 || yearDigit1 > 57) {
      return void 0;
    }
    const yearDigit2 = date2.charCodeAt(commaIndex + 10);
    if (yearDigit2 < 48 || yearDigit2 > 57) {
      return void 0;
    }
    let year = (yearDigit1 - 48) * 10 + (yearDigit2 - 48);
    year += year < 70 ? 2e3 : 1900;
    let hour = 0;
    if (date2[commaIndex + 12] === "0") {
      const code = date2.charCodeAt(commaIndex + 13);
      if (code < 48 || code > 57) {
        return void 0;
      }
      hour = code - 48;
    } else {
      const code1 = date2.charCodeAt(commaIndex + 12);
      if (code1 < 48 || code1 > 50) {
        return void 0;
      }
      const code2 = date2.charCodeAt(commaIndex + 13);
      if (code2 < 48 || code2 > 57) {
        return void 0;
      }
      if (code1 === 50 && code2 > 51) {
        return void 0;
      }
      hour = (code1 - 48) * 10 + (code2 - 48);
    }
    let minute = 0;
    if (date2[commaIndex + 15] === "0") {
      const code = date2.charCodeAt(commaIndex + 16);
      if (code < 48 || code > 57) {
        return void 0;
      }
      minute = code - 48;
    } else {
      const code1 = date2.charCodeAt(commaIndex + 15);
      if (code1 < 48 || code1 > 53) {
        return void 0;
      }
      const code2 = date2.charCodeAt(commaIndex + 16);
      if (code2 < 48 || code2 > 57) {
        return void 0;
      }
      minute = (code1 - 48) * 10 + (code2 - 48);
    }
    let second = 0;
    if (date2[commaIndex + 18] === "0") {
      const code = date2.charCodeAt(commaIndex + 19);
      if (code < 48 || code > 57) {
        return void 0;
      }
      second = code - 48;
    } else {
      const code1 = date2.charCodeAt(commaIndex + 18);
      if (code1 < 48 || code1 > 53) {
        return void 0;
      }
      const code2 = date2.charCodeAt(commaIndex + 19);
      if (code2 < 48 || code2 > 57) {
        return void 0;
      }
      second = (code1 - 48) * 10 + (code2 - 48);
    }
    const result = new Date(Date.UTC(year, monthIdx, day, hour, minute, second));
    return result.getUTCDay() === weekday ? result : void 0;
  }
  date = {
    parseHttpDate
  };
  return date;
}
export {
  requireDate as __require
};
//# sourceMappingURL=index113.js.map
