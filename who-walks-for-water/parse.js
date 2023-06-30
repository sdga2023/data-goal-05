const fs = require("fs");
const csvParser = require("csv-parser");

// household data from
// Kamei, Akito. 2022. Who Walks for Water? Water Consumption and Labor Supply Response to Rainfall Scarcity in Uganda.
const householdFile = "./full_household_data.csv";

const parseData = (data) => {
  const genderAgeGroups = {
    3: { gender: 0, age: [5, 12] },
    4: { gender: 0, age: [13, 18] },
    6: { gender: 0, age: [19, 59] },
    5: { gender: 1, age: [19, 59] },
    2: { gender: 1, age: [13, 18] },
    1: { gender: 1, age: [5, 12] },
  };

  const rainfallGroups = {
    Drought: 1,
    "Moderate Scarcity": 2,
    Normal: 3,
    "Moderate Abundance": 4,
    Abundance: 5,
  };

  let householdAccessor = (d) => d.HHID;
  let yearAccessor = (d) => d.Year;
  let gaAccessor = (d) => d.Demo_group_Detail;
  let rainfallAccessor = (d) => d.Ln_2012_2002_Categ;
  let valueAccessor = (d) => (d.fetch_water_ga === null ? 0 : d.fetch_water_ga);
  let hhValueAccessor = (d) => d.fetch_water;
  let genderAccessor = (d) => genderAgeGroups[gaAccessor(d)].gender;

  let allHHids = Array.from(new Set(data.map((d) => householdAccessor(d))));

  // only use 'Drought' and 'Normal' data:
  let parsedData = data.filter(
    (d) =>
      rainfallAccessor(d) === rainfallGroups["Drought"] ||
      rainfallAccessor(d) === rainfallGroups["Normal"]
  );

  // remove seniors
  parsedData = parsedData.filter((d) => gaAccessor(d) !== 7);

  // only use actual households (where individuals' contributions add up to the total household value):
  parsedData = allHHids.reduce((acc, hhid) => {
    const hhData = parsedData.filter((d) => householdAccessor(d) === hhid);
    let isValidHH = true;
    // split by years, check for each year:
    const hhYears = Array.from(new Set(hhData.map((d) => yearAccessor(d))));
    hhYears.forEach((year) => {
      const hhYearData = hhData.filter((d) => yearAccessor(d) === year);
      const hhSum = hhYearData.reduce(
        (akku, value) => akku + valueAccessor(value),
        0
      );

      // doesn't add up. don't use this household:
      if (hhSum !== hhValueAccessor(hhYearData[0])) {
        isValidHH = false;
      }
    });

    if (isValidHH) {
      acc.push(
        ...hhData.map((d) => ({
          ...d,
          hhsize: hhData.filter((dd) => yearAccessor(dd) === yearAccessor(d))
            .length,
        }))
      );
    }
    return acc;
  }, []);

  // round-down .5 values (0.5 hours, 3.5 hours, 10.5 hours etc.)
  parsedData = parsedData.map((d) => ({
    ...d,
    fetch_water_ga: Math.floor(d.fetch_water_ga),
  }));

  let timeTabularData = (() => {
    actualTabularData = "rainfallGroup, hours, total, 1, 2, 3, 4, 5, 6";

    let result = [];
    const valueRanges = Array.from(
      new Set(parsedData.map((d) => valueAccessor(d)))
    ).sort((a, b) => a - b);

    [1, 3].forEach((rainfallGroup) => {
      valueRanges.forEach((timeSpent) => {
        let entry = { rainfallGroup, hours: timeSpent };
        let total = 0;
        Object.keys(genderAgeGroups).forEach((ga) => {
          const gaValue = parsedData.filter(
            (d) =>
              rainfallAccessor(d) === rainfallGroup &&
              +gaAccessor(d) === +ga &&
              valueAccessor(d) === timeSpent
          ).length;
          entry[ga] = gaValue;
          total += gaValue;
        });

        entry.total = total;
        result.push(entry);

        actualTabularData +=
          "\n" +
          [
            rainfallGroup,
            timeSpent,
            total,
            entry[1],
            entry[2],
            entry[3],
            entry[4],
            entry[5],
            entry[6],
          ].join(",");
      });
    });

    return actualTabularData;
  })();

  return timeTabularData;
};

const process = async () => {
  let households = [];

  fs.createReadStream(householdFile)
    .pipe(csvParser())
    .on("data", (data) => {
      households.push(
        Object.keys(data).reduce((acc, key) => {
          acc[key] = +data[key];
          return acc;
        }, {})
      );
    })
    .on("end", () => {
      const result = parseData(households);

      fs.writeFileSync("out/waterfetching_condensed.csv", result, {
        encoding: "utf8",
        flag: "w",
      });
    });
};

process();
