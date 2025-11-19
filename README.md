# "Modern Classic RGB" Skin Theme for Foobar2000 2.0+ 64Bit
Simple cool layout using the default user interface and plugins for the 64bit version of foobar2000 2.0+ portable mode.

  ![Screenshot Nov. 2025](https://github.com/JBW-byte/Modern-Classic-RGB-Foobar2000-2.0-64bit/blob/main/Modern_Classic_RGB_Foobar_64bit.fth)  

To install the theme goto Prefrences, Default User Interface and click import theme, select the .fth file, you will need to use dark mode in foobar(display menu/colors and font) or on your desktop to match the borders.

https://github.com/JBW-byte/Modern-Classic-RGB-Foobar2000-2.0-64bit/blob/main/Modern_Classic_RGB_Foobar_64bit.fth

##  

<img width="1280" height="720" alt="Modern_Classic_RGB_Foobar_64bit" src="https://github.com/user-attachments/assets/8f24786b-f0c9-45df-afa3-d47345a2429b" />  

<img width="1280" height="720" alt="Modern_Classic_RGB_Foobar_64bit_2" src="https://github.com/user-attachments/assets/73e11aec-a9b3-480f-8e11-93d3c4bd4427" />  

<img width="1280" height="720" alt="Modern_Classic_RGB_Foobar_64bit_3" src="https://github.com/user-attachments/assets/f12dcd1d-b4b2-4e7c-b328-09dbb9b18d88" />  

<img width="1280" height="720" alt="Modern_Classic_RGB_Foobar_64bit_4" src="https://github.com/user-attachments/assets/87332001-8c3e-4e60-b0bc-8ad07914b261" />  



      ui <- grid_page(
  layout = my_layout,
  grid_card_text("header", "My gridlayout app"),
  grid_card(
    "chickens",
    tabsetPanel(
      tabPanel("Plot", plotOutput("chickPlot", height = "100%")),
      tabPanel("Fastest growing", gt_output("chickTable"))
    )
  ),
  grid_card(
    "treePlot",
    plotOutput("treePlot", height = "100%")
  ),
  grid_card(
    "yarnPlot",
    plotOutput("yarnPlot", height = "100%")
  ),
  grid_card(
    "stockTable",
    gt_output("stockTable"), scrollable = TRUE
  ),
  # Allows us to use layouts without some elements declared
  flag_mismatches = FALSE 
)
