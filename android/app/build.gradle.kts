import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// ---------------------------------------------------------------------------
// Web app assets: copied from the project root at build time so the repo never
// holds a second copy of index.html / css / src / fixtures.
// ---------------------------------------------------------------------------
val webRoot: File = rootDir.parentFile
val wwwAssetsRoot: File = layout.buildDirectory.dir("generated/www-assets").get().asFile

val syncWebAssets by tasks.registering(Sync::class) {
    description = "Copies the PM-SIM web app (index.html, css, src, fixtures) into generated assets."
    from(webRoot) {
        include("index.html", "css/**", "src/**", "fixtures/**")
    }
    into(File(wwwAssetsRoot, "www"))
}

// ---------------------------------------------------------------------------
// Release signing: values come from environment variables, or (fallback) from
// ~/.android/pmsim-release.env (override path with PMSIM_ENV_FILE). Nothing
// secret is stored in this repository.
// ---------------------------------------------------------------------------
val signingEnvFile = File(
    System.getenv("PMSIM_ENV_FILE") ?: "${System.getProperty("user.home")}/.android/pmsim-release.env"
)
val signingEnvFileValues: Map<String, String> =
    if (signingEnvFile.isFile) {
        val re = Regex("""^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$""")
        signingEnvFile.readLines().mapNotNull { line ->
            re.find(line)?.let { m ->
                m.groupValues[1] to m.groupValues[2].trim().removeSurrounding("\"").removeSurrounding("'")
            }
        }.toMap()
    } else emptyMap()

fun signingValue(name: String): String? =
    (System.getenv(name)?.takeIf { it.isNotBlank() } ?: signingEnvFileValues[name])
        ?.replace("\$HOME", System.getProperty("user.home"))
        ?.replace("\${HOME}", System.getProperty("user.home"))
        ?.let { if (it.startsWith("~/")) System.getProperty("user.home") + it.substring(1) else it }

val releaseKeystore = signingValue("PMSIM_KEYSTORE")?.let { File(it) }
val haveReleaseSigning = releaseKeystore?.isFile == true &&
    signingValue("PMSIM_KEYSTORE_PASSWORD") != null &&
    signingValue("PMSIM_KEY_ALIAS") != null

android {
    namespace = "edu.deu.pmsim"
    compileSdk = 35

    defaultConfig {
        applicationId = "edu.deu.pmsim"
        minSdk = 26
        targetSdk = 35
        versionCode = 4
        versionName = "1.2.1"
    }

    signingConfigs {
        if (haveReleaseSigning) {
            create("release") {
                storeFile = releaseKeystore
                storePassword = signingValue("PMSIM_KEYSTORE_PASSWORD")
                keyAlias = signingValue("PMSIM_KEY_ALIAS")
                keyPassword = signingValue("PMSIM_KEY_PASSWORD") ?: signingValue("PMSIM_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (haveReleaseSigning) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }

    sourceSets {
        getByName("main") {
            assets.srcDir(files(wwwAssetsRoot).builtBy(syncWebAssets))
        }
    }

    packaging {
        resources.excludes += setOf("META-INF/*.version", "META-INF/*.kotlin_module", "kotlin/**", "DebugProbesKt.bin")
    }

    lint {
        // The generated web assets are not Android code; keep lint focused on the wrapper.
        checkReleaseBuilds = true
        abortOnError = false
    }
}

// Belt and braces: anything that reads assets must run after the copy.
tasks.matching { it.name.startsWith("merge") && it.name.endsWith("Assets") }
    .configureEach { dependsOn(syncWebAssets) }
tasks.named("preBuild") { dependsOn(syncWebAssets) }

// Copy the signed release APK next to the desktop builds.
val copyReleaseApk by tasks.registering(Copy::class) {
    description = "Copies the release APK to <project>/release/PM-SIM-<version>-android.apk"
    from(layout.buildDirectory.dir("outputs/apk/release")) {
        include("*.apk")
        rename { "PM-SIM-1.2.1-android.apk" }
    }
    into(File(webRoot, "release"))
    doFirst {
        if (!haveReleaseSigning) logger.warn("PM-SIM: release signing config not found; copied APK is UNSIGNED.")
    }
}
tasks.matching { it.name == "assembleRelease" }.configureEach { finalizedBy(copyReleaseApk) }

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    // 1.1.0-beta01 is the newest connect-client whose AAR allows compileSdk 35 / AGP 8.7
    // (1.1.0-beta02 and later require compileSdk 36 + AGP 8.9.1).
    implementation("androidx.health.connect:connect-client:1.1.0-beta01")
}
