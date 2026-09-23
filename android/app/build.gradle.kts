plugins {
    id("com.android.application")
}

android {
    namespace = "jp.playstudy.apk"
    compileSdk = 36

    defaultConfig {
        applicationId = "jp.playstudy.apk"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        create("playstudy") {
            storeFile = file(System.getenv("PLAYSTUDY_KEYSTORE_PATH") ?: "release-keystore.p12")
            storePassword = System.getenv("PLAYSTUDY_STORE_PASSWORD") ?: ""
            keyAlias = "playstudy"
            keyPassword = System.getenv("PLAYSTUDY_STORE_PASSWORD") ?: ""
            storeType = "PKCS12"
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("playstudy")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.17.0")
}
