# 🌾 DailyVet AI + NASA Agro-Ecological Suite

> **AI-powered veterinary assistant + satellite-driven farm intelligence for Bangladesh**

[![NASA Space Apps Challenge](https://img.shields.io/badge/NASA-Space%20Apps%202026-blue)](https://www.spaceappschallenge.org/)
[![Made in Bangladesh](https://img.shields.io/badge/Made%20in-Bangladesh-green)](https://bangladesh.gov.bd/)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-purple)](https://web.dev/progressive-web-apps/)

**DailyVet** is a comprehensive AI + NASA satellite-powered farm intelligence suite designed for Bangladesh's 1M+ livestock farmers. It combines veterinary AI, real-time satellite data, and Bangla-first UX to help farmers protect their animals, optimize forage, and prepare for climate risks.

---

## 📋 Table of Contents

- [The Problem](#-the-problem)
- [Our Solution](#-our-solution)
- [Features](#-features)
- [NASA Datasets Used](#-nasa-datasets-used)
- [Screenshots](#-screenshots)
- [How It Works](#-how-it-works)
- [Tech Stack](#-tech-stack)
- [Installation](#-installation)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [API Reference](#-api-reference)
- [Impact](#-impact)
- [Roadmap](#-roadmap)
- [Team](#-team)
- [License](#-license)

---

## 🚨 The Problem

Bangladesh faces three critical agricultural challenges:

1. **Livestock Disease Outbreaks** — 24% of livestock die annually from preventable diseases like LSD, FMD, and PPR
2. **Climate Change Impact** — Erratic rainfall, floods, and droughts destroy forage crops
3. **Lack of Early Warning** — Small farmers have no access to satellite data or predictive intelligence

**Result:** Farmers lose **৳18-22 crore** per district per outbreak cycle.

---

## 💡 Our Solution

**DailyVet** integrates **NASA satellite datasets** with **AI-powered veterinary services** to give farmers:

- 🛰️ **Real-time climate alerts** (heat, flood, disease)
- 🌱 **Smart forage rotation advice** (drought/flood-safe grasses)
- 🦟 **Disease outbreak predictions** (rainfall + vector modeling)
- 📊 **Economic impact mapping** (people + livestock + money at risk)

All delivered in **Bangla** with **zero API key setup** for farmers.

---

## ✨ Features

### Part 1: Core DailyVet App (AI Vet Assistant)

| Feature | Description |
|---|---|
| 🤖 **AI Vet Chat** | Gemini + Groq + OpenRouter powered veterinary advice |
| 🍽️ **Feed Advisor** | Species-specific diet plans with BMI analysis |
| 🐄 **Breed Detection** | AI-powered cattle breed + health integrity check |
| 💩 **Dung & Urine Scan** | Excreta analysis for disease detection |
| 📄 **PR Scanner** | Prescription & medical report OCR |
| 💊 **Pharma Search** | Disease → medicine with BD brand mapping |
| 👥 **Community** | Farmers + verified vets connect |
| 🔔 **Smart Notifications** | Auto medicine + vaccine reminders |

### Part 2: NASA Climate Suite (5 Satellite-Driven Features)

#### 🌡️ Feature 1: Heat-Stress Alert (THI)
- **Species-specific** THI thresholds (cow, goat, poultry, dog, cat)
- Before/After/Tomorrow comparison with trend
- 7-day chart with color-coded bars
- Actionable steps (shade, water ×2, electrolytes)

#### 🌱 Feature 2: Forage Rotation Advisor
- NASA POWER soil moisture analysis
- Bangladesh-specific grass recommendations (Napier, German, Jumbo, Para, Fodder Maize)
- Month-by-month planting calendar
- Regional bias (Barind = drought, Coastal = flood)
- Irrigation + mulching advice

#### 🦟 Feature 3: Disease Outbreak Alert
- Rainfall + humidity + temperature → risk score
- **Transparent breakdown** (why 85%?)
- Top 3 diseases with individual scores
- Economic loss estimate (with double-count prevention)
- Bangla notification with action checklist

#### 📊 Feature 4: Impact Mapping
- NASA SEDAC GPW v4.11 population data
- Step-by-step calculation breakdown
- Marginal farmers + livestock at risk
- Economic loss range (৳ min-max crore)

#### 🗺️ Feature 5: Division Risk Map
- **Real Leaflet map** with 8 Bangladesh divisions
- Bangla name labels on every division
- Interactive polygons with hover/click
- Street/Satellite toggle
- Vulnerability ranking list
- Economic totals grid

---

## 🛰️ NASA Datasets Used

| Dataset | Source | Parameters | Feature |
|---|---|---|---|
| **NASA POWER** | [power.larc.nasa.gov](https://power.larc.nasa.gov/) | T2M, RH2M, GWETTOP, PRECTOTCORR | THI, Forage, Outbreak |
| **NASA SEDAC (GPW v4.11)** | [sedac.ciesin.columbia.edu](https://sedac.ciesin.columbia.edu/) | Population Density | Impact Mapping |
| **NASA GPM IMERG** | [gpm.nasa.gov](https://gpm.nasa.gov/) | Rainfall | (Derived via POWER) |
| **NASA SMAP** | [smap.jpl.nasa.gov](https://smap.jpl.nasa.gov/) | Soil Moisture | (Future scope) |
| **NASA MODIS** | [modis.gsfc.nasa.gov](https://modis.gsfc.nasa.gov/) | Land Surface Temp | (Future scope) |

**All APIs are key-free and public.**

---

## 📸 Screenshots

### Hub Page