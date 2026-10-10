/**
 * Worldwide Location Hierarchy Taxonomy
 * Structure: Country -> State/Province/Region -> City -> District/Area
 */

const LOCATIONS_DATA = {
    "Pakistan": {
        "Punjab": {
            "Lahore": [
                "Gulberg", "DHA (Defence)", "Johar Town", "Model Town", "Garden Town",
                "Bahria Town", "Faisal Town", "Wapda Town", "Cavalry Ground", "Shadman",
                "Mall Road", "Lahore Cantt", "Allama Iqbal Town", "Township", "Mughalpura",
                "Samanabad", "Gulshan-e-Ravi", "Valencia", "Askari 10 & 11", "Central Lahore"
            ],
            "Rawalpindi": [
                "Saddar", "Satellite Town", "Bahria Town", "Westridge", "Chaklala Scheme",
                "Commercial Market", "Peshawar Road", "Gulrez Housing", "Adiala Road", "Askari"
            ],
            "Faisalabad": [
                "D Ground", "Peoples Colony", "Madina Town", "Kohinoor City", "Canal Road",
                "Jaranwala Road", "Satiana Road", "Civil Lines", "Millat Town"
            ],
            "Multan": [
                "Multan Cantt", "Bosan Road", "Gulgasht Colony", "Shah Rukn-e-Alam",
                "New Multan", "MDA Officers Colony", "Model Town"
            ],
            "Gujranwala": [
                "Model Town", "DC Colony", "Wapda Town", "Satellite Town", "Gujranwala Cantt",
                "Rahwali Cantt", "Peoples Colony", "Master City"
            ],
            "Sialkot": [
                "Sialkot Cantt", "Paris Road", "Kashmir Road", "Model Town", "Defense Road",
                "Ugoki", "Khadim Ali Road"
            ],
            "Bahawalpur": [
                "Model Town", "Bahawalpur Cantt", "Satellite Town", "One Unit Colony", "Circular Road"
            ],
            "Sargodha": [
                "University Road", "Satellite Town", "PAF Base Area", "Fatima Jinnah Colony", "Club Road"
            ],
            "Gujrat": [
                "Servis Mor", "Rehman Shaheed Road", "Model Town", "GT Road", "Court Road"
            ]
        },
        "Sindh": {
            "Karachi": [
                "Clifton", "DHA (Phase 1-8)", "Gulshan-e-Iqbal", "PECHS", "North Nazimabad",
                "Saddar", "Bahadurabad", "Korangi", "Gulistan-e-Johar", "Tariq Road",
                "Shahrah-e-Faisal", "Malir Cantt", "Federal B Area", "Buffer Zone", "Scheme 33"
            ],
            "Hyderabad": [
                "Latifabad", "Qasimabad", "Saddar", "Auto Bahn Road", "Citizen Colony", "Hirabad"
            ],
            "Sukkur": [
                "Military Road", "Barrage Colony", "Minara Road", "Queens Road", "Shikarpur Road"
            ]
        },
        "Islamabad ICT": {
            "Islamabad": [
                "Blue Area", "Sector F-6 (Super Market)", "Sector F-7 (Jinnah Super)", "Sector F-8",
                "Sector F-10", "Sector F-11", "Sector G-8", "Sector G-9 (Karachi Co)", "Sector G-10",
                "Sector G-11", "Sector E-7", "Sector E-11", "DHA Islamabad", "Bahria Town Islamabad",
                "Sector I-8", "PWD Housing", "Gulberg Greens", "Park View City"
            ]
        },
        "Khyber Pakhtunkhwa": {
            "Peshawar": [
                "University Town", "Hayatabad (Phase 1-7)", "Peshawar Saddar", "Ring Road",
                "Warsak Road", "Peshawar Cantt", "Gulbahar"
            ],
            "Abbottabad": [
                "Mandian", "Supply Area", "PMA Road", "Abbottabad Cantt", "Jinnahabad", "Murree Road"
            ],
            "Mardan": [
                "Mardan Cantt", "Baghdada", "Bank Road", "Shamsi Road", "Charsadda Road"
            ]
        },
        "Balochistan": {
            "Quetta": [
                "Quetta Cantt", "Zarghoon Road", "Jinnah Road", "Samungli Road", "Model Town", "Shahrah-e-Iqbal"
            ]
        }
    },
    "United Arab Emirates": {
        "Dubai": {
            "Dubai City": [
                "Downtown Dubai", "Dubai Marina", "Business Bay", "Jumeirah (J1, J2, J3)",
                "Palm Jumeirah", "Al Barsha", "Jumeirah Lakes Towers (JLT)", "DIFC (Financial Centre)",
                "Deira", "Bur Dubai", "Mirdif", "Arabian Ranches", "Dubai Silicon Oasis",
                "Al Quoz", "City Walk", "Al Karama", "Dubai Hills Estate", "Al Garhoud"
            ]
        },
        "Abu Dhabi": {
            "Abu Dhabi City": [
                "Corniche Road", "Al Reem Island", "Al Khalidiya", "Yas Island", "Saadiyat Island",
                "Al Maryah Island", "Khalifa City", "Mohammed Bin Zayed City", "Al Bateen", "Al Karamah"
            ],
            "Al Ain": [
                "Al Jahili", "Al Jimi", "Al Foah", "Al Khabisi", "Al Muwaiji"
            ]
        },
        "Sharjah": {
            "Sharjah City": [
                "Al Majaz", "Al Nahda", "Al Qasimia", "Muwailih Commercial", "Al Khan",
                "University City", "Al Taawun", "Al Rolla"
            ]
        },
        "Ajman": {
            "Ajman City": [
                "Al Nuaimiya", "Al Rashidiya", "Ajman Corniche", "Al Jurf", "Al Rawda"
            ]
        }
    },
    "United States": {
        "California": {
            "Los Angeles": [
                "Beverly Hills", "Downtown LA (DTLA)", "Santa Monica", "Hollywood", "West Hollywood",
                "Pasadena", "Glendale", "Culver City", "Westwood", "Venice", "Sherman Oaks", "Century City"
            ],
            "San Francisco": [
                "Financial District", "SoMa", "Mission District", "Marina District", "Pacific Heights",
                "Nob Hill", "Presidio", "Fisherman's Wharf", "Castro"
            ],
            "San Diego": [
                "Downtown San Diego", "La Jolla", "Pacific Beach", "North Park", "Mission Valley", "Gaslamp Quarter"
            ],
            "San Jose": [
                "Downtown San Jose", "Willow Glen", "Santana Row", "North San Jose", "Almaden Valley"
            ],
            "Irvine": [
                "Irvine Spectrum", "University Park", "Woodbridge", "Turtle Rock", "Northwood"
            ]
        },
        "New York": {
            "New York City": [
                "Manhattan - Midtown", "Manhattan - Financial District", "Manhattan - Upper East Side",
                "Manhattan - Upper West Side", "Manhattan - SoHo", "Manhattan - Tribeca", "Manhattan - Chelsea",
                "Brooklyn - Williamsburg", "Brooklyn - DUMBO", "Brooklyn - Brooklyn Heights",
                "Queens - Astoria", "Queens - Long Island City"
            ],
            "Buffalo": [
                "Downtown Buffalo", "Elmwood Village", "North Buffalo", "Allentown"
            ]
        },
        "Texas": {
            "Houston": [
                "Downtown Houston", "The Galleria / Uptown", "Montrose", "Texas Medical Center",
                "The Heights", "River Oaks", "Midtown Houston", "Memorial", "Sugar Land"
            ],
            "Dallas": [
                "Downtown Dallas", "Uptown Dallas", "Deep Ellum", "Highland Park", "Oak Lawn", "Preston Hollow"
            ],
            "Austin": [
                "Downtown Austin", "South Congress (SoCo)", "East Austin", "The Domain", "Barton Hills"
            ]
        },
        "Florida": {
            "Miami": [
                "Brickell", "Downtown Miami", "South Beach", "Wynwood", "Coral Gables", "Coconut Grove", "Doral"
            ],
            "Orlando": [
                "Downtown Orlando", "Winter Park", "Lake Nona", "Dr. Phillips", "Thornton Park"
            ]
        },
        "Illinois": {
            "Chicago": [
                "The Loop", "Lincoln Park", "River North", "West Loop", "Wicker Park", "Lakeview", "Gold Coast"
            ]
        }
    },
    "United Kingdom": {
        "England": {
            "London": [
                "City of London", "Westminster", "Camden", "Kensington & Chelsea", "Canary Wharf",
                "Soho", "Mayfair", "Islington", "Hackney", "Greenwich", "Shoreditch", "Covent Garden", "Fulham"
            ],
            "Manchester": [
                "Manchester City Centre", "Northern Quarter", "Deansgate", "Ancoats", "Salford Quays", "Didsbury"
            ],
            "Birmingham": [
                "City Centre", "Jewellery Quarter", "Digbeth", "Edgbaston", "Harborne", "Solihull"
            ],
            "Leeds": [
                "City Centre", "Headingley", "Chapel Allerton", "Roundhay", "Horsforth"
            ],
            "Bristol": [
                "Harbourside", "Clifton", "Gloucester Road", "Southville", "Redland"
            ]
        },
        "Scotland": {
            "Edinburgh": [
                "Old Town", "New Town", "Leith", "Stockbridge", "Haymarket", "Morningside"
            ],
            "Glasgow": [
                "Glasgow City Centre", "West End", "Merchant City", "Southside", "Shawlands"
            ]
        }
    },
    "Saudi Arabia": {
        "Riyadh Province": {
            "Riyadh": [
                "Al Olaya", "Al Malaz", "Al Nakheel", "Hittin", "Al Sahafah", "Diplomatic Quarter",
                "Al Sulaimaniyah", "Al Yasmin", "KAFD (Financial District)", "Al Narjis", "Al Murabba"
            ]
        },
        "Makkah Province": {
            "Jeddah": [
                "Al Hamra", "Al Rawdah", "Al Andalus", "Al Zahra", "Al Shati", "Al Naeem", "Al Salamah", "Obhur"
            ],
            "Makkah": [
                "Al Aziziyah", "Al Shawqiyyah", "Al Naseem", "Al Rusayfah"
            ]
        },
        "Eastern Province": {
            "Khobar": [
                "Al Ulaya", "Al Rakah", "Al Yarmouk", "Al Hizam Al Thahabi", "Khobar Corniche"
            ],
            "Dammam": [
                "Al Faisaliyah", "Al Shate'a", "Al Jalawiyah", "Al Hussam"
            ]
        }
    },
    "Canada": {
        "Ontario": {
            "Toronto": [
                "Downtown Toronto", "Yorkville", "North York", "Scarborough", "Mississauga",
                "Etobicoke", "Markham", "Financial District", "Liberty Village"
            ],
            "Ottawa": [
                "Centretown", "ByWard Market", "The Glebe", "Kanata", "Westboro"
            ]
        },
        "British Columbia": {
            "Vancouver": [
                "Downtown Vancouver", "Yaletown", "Gastown", "Kitsilano", "Mount Pleasant",
                "West End", "Richmond", "Burnaby"
            ]
        }
    },
    "Australia": {
        "New South Wales": {
            "Sydney": [
                "Sydney CBD", "Bondi", "Surry Hills", "Parramatta", "Manly", "Chatswood",
                "Darlinghurst", "Newtown", "Paddington", "North Sydney"
            ]
        },
        "Victoria": {
            "Melbourne": [
                "Melbourne CBD", "Southbank", "Fitzroy", "St Kilda", "Carlton", "Richmond", "South Yarra"
            ]
        }
    },
    "Qatar": {
        "Doha Municipality": {
            "Doha": [
                "West Bay", "The Pearl-Qatar", "Lusail", "Msheireb Downtown", "Al Sadd", "Al Waab", "Al Dafna"
            ]
        }
    },
    "Germany": {
        "Berlin": {
            "Berlin City": [
                "Mitte", "Kreuzberg", "Prenzlauer Berg", "Charlottenburg", "Friedrichshain", "Schöneberg"
            ]
        },
        "Bavaria": {
            "Munich": [
                "Altstadt", "Schwabing", "Maxvorstadt", "Bogenhausen", "Glockenbachviertel"
            ]
        }
    },
    "France": {
        "Île-de-France": {
            "Paris": [
                "1st Arr. (Louvre)", "8th Arr. (Champs-Élysées)", "9th Arr. (Opéra)",
                "16th Arr. (Passy)", "Le Marais", "Montmartre", "La Défense"
            ]
        }
    },
    "Turkey": {
        "Istanbul": {
            "Istanbul City": [
                "Kadıköy", "Beşiktaş", "Şişli", "Beyoğlu", "Bakırköy", "Sarıyer", "Üsküdar"
            ]
        }
    }
};

// All other worldwide countries
const ALL_COUNTRIES = [
    "Pakistan",
    "United Arab Emirates",
    "United States",
    "United Kingdom",
    "Saudi Arabia",
    "Canada",
    "Australia",
    "Qatar",
    "Germany",
    "France",
    "Turkey",
    "Kuwait",
    "Oman",
    "Bahrain",
    "India",
    "Singapore",
    "Malaysia",
    "Netherlands",
    "Switzerland",
    "Spain",
    "Italy",
    "Sweden",
    "Norway",
    "Denmark",
    "Ireland",
    "New Zealand",
    "South Africa",
    "Brazil",
    "Mexico",
    "Japan",
    "South Korea",
    "Austria",
    "Belgium",
    "Portugal",
    "Greece",
    "Poland",
    "Czech Republic",
    "Romania",
    "Hungary",
    "Egypt",
    "Jordan",
    "Morocco"
];

module.exports = {
    LOCATIONS_DATA,
    ALL_COUNTRIES
};
